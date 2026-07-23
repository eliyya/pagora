import 'server-only'

import { createHash } from 'node:crypto'
import { z } from 'zod'
import type {
    ChargeCategory,
    Prisma,
} from '@/db/generated/prisma/client'
import { db } from '@/db/prisma'
import { canWriteCard, getCardAccess } from '@/lib/card-access'
import {
    beginCardChange,
    recordCardChanges,
    type CardChangeInput,
} from '@/lib/card-changes'
import { serializeCharge } from '@/lib/card-sync'
import type {
    ClientMutation,
    ClientMutationResult,
    PushCardMutationsRequest,
    PushCardMutationsResponse,
} from '@/lib/card-mutations.types'

const POSTGRES_INTEGER_MAX = 2_147_483_647
const MAX_MUTATIONS_PER_PUSH = 100

const idSchema = z.string().trim().min(1).max(512)
const categoryNameSchema = z
    .string()
    .trim()
    .max(60)
    .nullable()
    .optional()
const categoryIdSchema = idSchema.nullable().optional()
const mutationBaseSchema = {
    mutationId: idSchema,
    occurredAt: z.iso.datetime({ offset: true }),
    dependsOn: z.array(idSchema).max(100).optional(),
}
const amountSchema = z
    .number()
    .int()
    .positive()
    .max(POSTGRES_INTEGER_MAX)
const revisionSchema = z
    .number()
    .int()
    .min(0)
    .max(POSTGRES_INTEGER_MAX)

const clientMutationSchema = z.discriminatedUnion('type', [
    z
        .object({
            ...mutationBaseSchema,
            type: z.literal('charge.create'),
            charge: z
                .object({
                    id: idSchema,
                    name: z.string().trim().min(1).max(500),
                    amount: amountSchema,
                    categoryId: categoryIdSchema,
                    categoryName: categoryNameSchema,
                })
                .strict(),
        })
        .strict(),
    z
        .object({
            ...mutationBaseSchema,
            type: z.literal('charge.update'),
            chargeId: idSchema,
            baseRevision: revisionSchema,
            name: z.string().trim().min(1).max(500),
            amount: amountSchema,
            categoryId: categoryIdSchema,
            categoryName: categoryNameSchema,
        })
        .strict(),
    z
        .object({
            ...mutationBaseSchema,
            type: z.literal('charge.delete'),
            chargeId: idSchema,
            baseRevision: revisionSchema,
        })
        .strict(),
])

export const pushCardMutationsRequestSchema = z
    .object({
        mutations: z
            .array(clientMutationSchema)
            .min(1)
            .max(MAX_MUTATIONS_PER_PUSH),
    })
    .strict()

type CardMutationPushResult =
    | { status: 'not-found' }
    | { status: 'forbidden' }
    | { status: 'ok'; data: PushCardMutationsResponse }

type CategoryResolution =
    | { status: 'ok'; category: ChargeCategory | null }
    | { status: 'rejected'; reason: string }

type DependencyResolution =
    | {
          status: 'ok'
          results: Map<string, ClientMutationResult>
      }
    | {
          status: 'failed'
          dependencyMutationId: string
      }

function stableJson(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value) ?? 'null'
    }
    if (Array.isArray(value)) {
        return `[${value.map(stableJson).join(',')}]`
    }

    return `{${Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
            ([key, entry]) =>
                `${JSON.stringify(key)}:${stableJson(entry)}`,
        )
        .join(',')}}`
}

function hashMutation(mutation: ClientMutation) {
    return createHash('sha256')
        .update(stableJson(mutation))
        .digest('hex')
}

function resultBase(mutation: ClientMutation) {
    return {
        mutationId: mutation.mutationId,
        type: mutation.type,
    }
}

function rejectedResult(
    mutation: ClientMutation,
    reason: string,
): ClientMutationResult {
    return {
        ...resultBase(mutation),
        status: 'rejected',
        reason,
    }
}

function storedResult(result: Prisma.JsonValue): ClientMutationResult {
    return result as unknown as ClientMutationResult
}

async function saveResult(
    tx: Prisma.TransactionClient,
    cardId: string,
    userId: string,
    mutation: ClientMutation,
    requestHash: string,
    result: ClientMutationResult,
) {
    await tx.appliedMutation.create({
        data: {
            card_id: cardId,
            mutation_id: mutation.mutationId,
            user_id: userId,
            request_hash: requestHash,
            result: result as unknown as Prisma.InputJsonValue,
        },
    })
    return result
}

async function resolveCategory(
    tx: Prisma.TransactionClient,
    cardId: string,
    categoryId?: string | null,
    categoryName?: string | null,
): Promise<CategoryResolution> {
    const name = categoryName?.trim() || null

    if (categoryId) {
        const category = await tx.chargeCategory.findUnique({
            where: { id: categoryId },
        })
        if (category) {
            if (category.card_id !== cardId) {
                return {
                    status: 'rejected',
                    reason: 'category-id-in-use',
                }
            }
            return { status: 'ok', category }
        }
        if (!name) {
            return {
                status: 'rejected',
                reason: 'category-not-found',
            }
        }

        const categoryWithName = await tx.chargeCategory.findUnique({
            where: {
                card_id_name: {
                    card_id: cardId,
                    name,
                },
            },
        })
        if (categoryWithName) {
            return { status: 'ok', category: categoryWithName }
        }

        return {
            status: 'ok',
            category: await tx.chargeCategory.create({
                data: {
                    id: categoryId,
                    card_id: cardId,
                    name,
                },
            }),
        }
    }

    if (!name) return { status: 'ok', category: null }

    return {
        status: 'ok',
        category: await tx.chargeCategory.upsert({
            where: {
                card_id_name: {
                    card_id: cardId,
                    name,
                },
            },
            update: {},
            create: {
                card_id: cardId,
                name,
            },
        }),
    }
}

async function resolveDependencies(
    tx: Prisma.TransactionClient,
    cardId: string,
    userId: string,
    mutation: ClientMutation,
): Promise<DependencyResolution> {
    const dependencyIds = mutation.dependsOn ?? []
    const results = new Map<string, ClientMutationResult>()

    for (const dependencyMutationId of dependencyIds) {
        const dependency = await tx.appliedMutation.findUnique({
            where: {
                card_id_mutation_id: {
                    card_id: cardId,
                    mutation_id: dependencyMutationId,
                },
            },
        })
        if (!dependency || dependency.user_id !== userId) {
            return { status: 'failed', dependencyMutationId }
        }

        const result = storedResult(dependency.result)
        if (result.status !== 'applied') {
            return { status: 'failed', dependencyMutationId }
        }
        results.set(dependencyMutationId, result)
    }

    return { status: 'ok', results }
}

function effectiveBaseRevision(
    mutation: Extract<
        ClientMutation,
        { type: 'charge.update' | 'charge.delete' }
    >,
    dependencies: Map<string, ClientMutationResult>,
) {
    const dependencyIds = mutation.dependsOn ?? []
    for (let index = dependencyIds.length - 1; index >= 0; index -= 1) {
        const result = dependencies.get(dependencyIds[index])
        if (
            result?.status === 'applied' &&
            result.charge?.id === mutation.chargeId
        ) {
            return result.charge.revision
        }
    }
    return mutation.baseRevision
}

async function createCharge(
    tx: Prisma.TransactionClient,
    cardId: string,
    mutation: Extract<ClientMutation, { type: 'charge.create' }>,
): Promise<ClientMutationResult> {
    const existing = await tx.charge.findUnique({
        where: { id: mutation.charge.id },
        include: { category: true },
    })
    if (existing) {
        if (existing.card_id !== cardId) {
            return rejectedResult(mutation, 'charge-id-in-use')
        }
        return {
            ...resultBase(mutation),
            status: 'conflict',
            serverCharge: serializeCharge(existing),
        }
    }

    const category = await resolveCategory(
        tx,
        cardId,
        mutation.charge.categoryId,
        mutation.charge.categoryName,
    )
    if (category.status === 'rejected') {
        return rejectedResult(mutation, category.reason)
    }

    const cursor = await beginCardChange(cardId, tx)
    const charge = await tx.charge.create({
        data: {
            id: mutation.charge.id,
            card_id: cardId,
            name: mutation.charge.name,
            amount: mutation.charge.amount,
            category_id: category.category?.id ?? null,
            revision: cursor,
            created_at: new Date(mutation.occurredAt),
        },
        include: { category: true },
    })
    const changes: CardChangeInput[] = [
        {
            entity: 'charge',
            entityId: charge.id,
            operation: 'upsert',
        },
    ]
    if (category.category) {
        changes.unshift({
            entity: 'category',
            entityId: category.category.id,
            operation: 'upsert',
        })
    }
    await recordCardChanges(cardId, cursor, changes, tx)

    return {
        ...resultBase(mutation),
        status: 'applied',
        cursor,
        charge: serializeCharge(charge),
    }
}

async function updateCharge(
    tx: Prisma.TransactionClient,
    cardId: string,
    mutation: Extract<ClientMutation, { type: 'charge.update' }>,
    dependencies: Map<string, ClientMutationResult>,
): Promise<ClientMutationResult> {
    const current = await tx.charge.findUnique({
        where: { id: mutation.chargeId },
        include: { category: true },
    })
    if (!current || current.card_id !== cardId) {
        return {
            ...resultBase(mutation),
            status: 'gone',
        }
    }
    if (
        current.revision !==
        effectiveBaseRevision(mutation, dependencies)
    ) {
        return {
            ...resultBase(mutation),
            status: 'conflict',
            serverCharge: serializeCharge(current),
        }
    }

    const category = await resolveCategory(
        tx,
        cardId,
        mutation.categoryId,
        mutation.categoryName,
    )
    if (category.status === 'rejected') {
        return rejectedResult(mutation, category.reason)
    }

    const cursor = await beginCardChange(cardId, tx)
    const charge = await tx.charge.update({
        where: { id: mutation.chargeId },
        data: {
            name: mutation.name,
            amount: mutation.amount,
            category_id: category.category?.id ?? null,
            revision: cursor,
        },
        include: { category: true },
    })
    const changes: CardChangeInput[] = [
        {
            entity: 'charge',
            entityId: charge.id,
            operation: 'upsert',
        },
    ]
    if (category.category) {
        changes.unshift({
            entity: 'category',
            entityId: category.category.id,
            operation: 'upsert',
        })
    }
    await recordCardChanges(cardId, cursor, changes, tx)

    return {
        ...resultBase(mutation),
        status: 'applied',
        cursor,
        charge: serializeCharge(charge),
    }
}

async function deleteCharge(
    tx: Prisma.TransactionClient,
    cardId: string,
    mutation: Extract<ClientMutation, { type: 'charge.delete' }>,
    dependencies: Map<string, ClientMutationResult>,
): Promise<ClientMutationResult> {
    const current = await tx.charge.findUnique({
        where: { id: mutation.chargeId },
        include: { category: true },
    })
    if (!current || current.card_id !== cardId) {
        return {
            ...resultBase(mutation),
            status: 'gone',
        }
    }
    if (
        current.revision !==
        effectiveBaseRevision(mutation, dependencies)
    ) {
        return {
            ...resultBase(mutation),
            status: 'conflict',
            serverCharge: serializeCharge(current),
        }
    }

    const cursor = await beginCardChange(cardId, tx)
    await tx.charge.delete({ where: { id: mutation.chargeId } })
    await recordCardChanges(
        cardId,
        cursor,
        [
            {
                entity: 'charge',
                entityId: mutation.chargeId,
                operation: 'delete',
            },
        ],
        tx,
    )

    return {
        ...resultBase(mutation),
        status: 'applied',
        cursor,
        deletedChargeId: mutation.chargeId,
    }
}

async function applyMutation(
    tx: Prisma.TransactionClient,
    cardId: string,
    userId: string,
    mutation: ClientMutation,
) {
    const requestHash = hashMutation(mutation)
    const existing = await tx.appliedMutation.findUnique({
        where: {
            card_id_mutation_id: {
                card_id: cardId,
                mutation_id: mutation.mutationId,
            },
        },
    })
    if (existing) {
        if (
            existing.user_id === userId &&
            existing.request_hash === requestHash
        ) {
            return storedResult(existing.result)
        }
        return rejectedResult(mutation, 'mutation-id-reused')
    }

    const dependencies = await resolveDependencies(
        tx,
        cardId,
        userId,
        mutation,
    )
    if (dependencies.status === 'failed') {
        return await saveResult(
            tx,
            cardId,
            userId,
            mutation,
            requestHash,
            {
                ...resultBase(mutation),
                status: 'dependency-failed',
                dependencyMutationId:
                    dependencies.dependencyMutationId,
            },
        )
    }

    let result: ClientMutationResult
    switch (mutation.type) {
        case 'charge.create':
            result = await createCharge(tx, cardId, mutation)
            break
        case 'charge.update':
            result = await updateCharge(
                tx,
                cardId,
                mutation,
                dependencies.results,
            )
            break
        case 'charge.delete':
            result = await deleteCharge(
                tx,
                cardId,
                mutation,
                dependencies.results,
            )
            break
    }

    return await saveResult(
        tx,
        cardId,
        userId,
        mutation,
        requestHash,
        result,
    )
}

export async function pushCardMutations(
    cardId: string,
    userId: string,
    request: PushCardMutationsRequest,
): Promise<CardMutationPushResult> {
    return await db.$transaction(async (tx) => {
        const lockedCards = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "cards"
            WHERE "id" = ${cardId}
            FOR UPDATE
        `
        if (lockedCards.length === 0) return { status: 'not-found' }

        const access = await getCardAccess(cardId, userId, tx)
        if (!access || access.access === 'none') return { status: 'not-found' }
        if (!canWriteCard(access.access)) return { status: 'forbidden' }

        const results: ClientMutationResult[] = []
        for (const mutation of request.mutations) {
            results.push(
                await applyMutation(tx, cardId, userId, mutation),
            )
        }

        return {
            status: 'ok',
            data: { results },
        }
    })
}

export function parsePushCardMutationsRequest(
    value: unknown,
):
    | { success: true; data: PushCardMutationsRequest }
    | { success: false } {
    const parsed = pushCardMutationsRequestSchema.safeParse(value)
    if (!parsed.success) return { success: false }
    return {
        success: true,
        data: parsed.data as PushCardMutationsRequest,
    }
}
