import 'server-only'

import type {
    Charge,
    ChargeCategory,
    Prisma,
} from '@/db/generated/prisma/client'
import {
    buildInstallmentSchedule,
    isValidInstallmentPlanInput,
    type InstallmentPlanInput,
} from '@/lib/installments'

type ChargeWithCategory = Charge & {
    category: ChargeCategory | null
}

const POSTGRES_INTEGER_MAX = 2_147_483_647

export type CreateChargeSetInput = {
    cardId: string
    name: string
    amount: number
    categoryId?: string | null
    categoryName?: string | null
    installment?: InstallmentPlanInput
    createdAt?: Date
    chargeId?: string
    installmentIds?: string[]
}

async function resolveCategory(
    tx: Prisma.TransactionClient,
    input: Pick<
        CreateChargeSetInput,
        'cardId' | 'categoryId' | 'categoryName'
    >,
) {
    const name = input.categoryName?.trim() || null

    if (input.categoryId) {
        const existing = await tx.chargeCategory.findUnique({
            where: { id: input.categoryId },
        })
        if (existing) {
            if (existing.card_id !== input.cardId) {
                throw new Error('category id belongs to another card')
            }
            return existing
        }
        if (!name) throw new Error('category not found')
        return await tx.chargeCategory.create({
            data: {
                id: input.categoryId,
                card_id: input.cardId,
                name,
            },
        })
    }

    if (!name) return null
    return await tx.chargeCategory.upsert({
        where: {
            card_id_name: {
                card_id: input.cardId,
                name,
            },
        },
        update: {},
        create: {
            card_id: input.cardId,
            name,
        },
    })
}

export function dateOnlyToUtc(value: string) {
    return new Date(`${value}T00:00:00.000Z`)
}

export async function createChargeSet(
    tx: Prisma.TransactionClient,
    input: CreateChargeSetInput,
    revision: number,
): Promise<{
    charges: ChargeWithCategory[]
    category: ChargeCategory | null
}> {
    if (
        !Number.isSafeInteger(input.amount) ||
        input.amount <= 0 ||
        input.amount > POSTGRES_INTEGER_MAX
    ) {
        throw new RangeError('invalid charge amount')
    }
    if (!input.name.trim() || input.name.length > 500) {
        throw new RangeError('invalid charge name')
    }

    const category = await resolveCategory(tx, input)
    const createdAt = input.createdAt ?? new Date()

    if (!input.installment) {
        const charge = await tx.charge.create({
            data: {
                ...(input.chargeId ? { id: input.chargeId } : {}),
                card_id: input.cardId,
                name: input.name,
                amount: input.amount,
                category_id: category?.id ?? null,
                revision,
                scheduled_for: createdAt,
                created_at: createdAt,
            },
            include: { category: true },
        })
        return { charges: [charge], category }
    }

    if (!isValidInstallmentPlanInput(input.installment)) {
        throw new Error('invalid installment plan')
    }
    if (
        input.installmentIds &&
        input.installmentIds.length !== input.installment.count
    ) {
        throw new Error('invalid installment ids')
    }
    if (
        input.installmentIds &&
        new Set([input.chargeId, ...input.installmentIds].filter(Boolean))
            .size !==
            input.installmentIds.length + (input.chargeId ? 1 : 0)
    ) {
        throw new Error('installment ids must be unique')
    }

    const schedule = buildInstallmentSchedule({
        name: input.name,
        amount: input.amount,
        ...input.installment,
    })
    const parent = await tx.charge.create({
        data: {
            ...(input.chargeId ? { id: input.chargeId } : {}),
            card_id: input.cardId,
            name: input.name,
            amount: input.amount,
            category_id: category?.id ?? null,
            kind: 'installment_parent',
            installment_count: input.installment.count,
            scheduled_for: dateOnlyToUtc(
                input.installment.firstInstallmentDate,
            ),
            revision,
            created_at: createdAt,
        },
        include: { category: true },
    })
    await tx.charge.createMany({
        data: schedule.map((installment, index) => ({
            ...(input.installmentIds?.[index]
                ? { id: input.installmentIds[index] }
                : {}),
            card_id: input.cardId,
            installment_parent_id: parent.id,
            name: installment.name,
            amount: installment.amount,
            category_id: category?.id ?? null,
            kind: 'installment',
            installment_number: installment.installmentNumber,
            installment_count: installment.installmentCount,
            scheduled_for: dateOnlyToUtc(installment.scheduledFor),
            revision,
            created_at: createdAt,
        })),
    })
    const installments = await tx.charge.findMany({
        where: { installment_parent_id: parent.id },
        include: { category: true },
        orderBy: { installment_number: 'asc' },
    })

    return {
        charges: [parent, ...installments],
        category,
    }
}
