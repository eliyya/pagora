'use client'

import { fetchInfoAction } from '@/actions/info.action'
import {
    batchPayChargesAction,
    paidChargeAction,
} from '@/actions/chargue.action'
import { getCardSectionsAction } from '@/actions/card.action'
import {
    createChargeCategoryAction,
    deleteChargeCategoryAction,
    updateChargeCategoryAction,
} from '@/actions/charge-category.action'
import type {
    Card,
    Charge,
    ChargeCategory,
    User,
} from '@/db/generated/prisma/browser'
import {
    acknowledgeCardMutations,
    clearUserOfflineView,
    deleteCardCache,
    findLatestPendingMutationForCharge,
    getCardCacheKey,
    isStoredCardCache,
    listCardMutationConflicts,
    listPendingCardMutations,
    markCardMutationsAttempted,
    readCardCache,
    replaceCardMutationConflict,
    resolveCardMutationConflict,
    saveCardMutationConflict,
    saveOfflineReadyCard,
    saveOptimisticCardMutation,
    writeCardCache,
    type StoredCardCache,
    type StoredMutationConflict,
    type StoredOfflineSession,
    type StoredOutboxMutation,
} from '@/lib/client-card-cache'
import type {
    ChargeCreateMutation,
    ChargeDeleteMutation,
    ChargeUpdateMutation,
    ClientMutation,
    ClientMutationResult,
    InstallmentCreateMutation,
    InstallmentDeleteMutation,
    InstallmentUpdateMutation,
    PushCardMutationsResponse,
} from '@/lib/card-mutations.types'
import type {
    CardSyncPayload,
    DailySummary,
    SerializedCharge,
    SerializedChargeCategory,
} from '@/lib/card-sync.types'
import { toast } from 'sonner'
import { create } from 'zustand'
import {
    buildInstallmentSchedule,
    isAccountingCharge,
    isDateOnly,
    isInstallmentCharge,
    isInstallmentParentCharge,
    isValidInstallmentPlanInput,
    type InstallmentPlanInput,
} from '@/lib/installments'

export type CardAccessLevel = 'none' | 'read' | 'write' | 'owner'
export type SyncStatus =
    | 'idle'
    | 'syncing'
    | 'synced'
    | 'offline'
    | 'unauthorized'
    | 'unavailable'
    | 'error'

export type CardItem = Card & {
    access?: CardAccessLevel
    sharedBy?: {
        id: string
        username: string
        email: string
    }
}

type SharedByMeCard = Awaited<
    ReturnType<typeof getCardSectionsAction>
>['sharedByMe'][number]

export type ChargeWithCategory = Charge & {
    category: ChargeCategory | null
}

type RuntimeCardCache = {
    userId: string
    cardId: string
    cardAccess: CardAccessLevel
    snapshotReady: boolean
    cursor: number | null
    charges: ChargeWithCategory[]
    categories: ChargeCategory[]
    summary: DailySummary[]
}

export type BatchPaymentOutcome = {
    appliedAmount: number
    unappliedAmount: number
}

interface InfoStore {
    user: User | null
    card: CardItem | null
    cards: CardItem[]
    ownCards: CardItem[]
    sharedWithMeCards: CardItem[]
    sharedByMeCards: SharedByMeCard[]
    cardAccess: CardAccessLevel
    pendingInvitations: number
    charges: ChargeWithCategory[]
    categories: ChargeCategory[]
    summary: DailySummary[]
    pageSize: number
    activeUserId: string | null
    activeCardId: string | null
    syncCursor: number | null
    cardSnapshotReady: boolean
    syncStatus: SyncStatus
    pendingMutationCount: number
    syncConflicts: StoredMutationConflict[]
    hydrateOfflineSession(
        session: StoredOfflineSession,
        cardId: string,
    ): boolean
    fetch(cardId: string, userId: string): Promise<void>
    syncCard(cardId: string, userId: string): Promise<void>
    refreshCards(): Promise<void>
    createCharge(
        amount: number,
        name: string,
        categoryName?: string,
        installment?: InstallmentPlanInput,
    ): Promise<boolean>
    updateCharge(
        id: string,
        name: string,
        amount: number,
        categoryName?: string,
        installment?: InstallmentPlanInput,
    ): Promise<boolean>
    deleteCharge(id: string): Promise<boolean>
    acceptServerConflict(mutationId: string): Promise<void>
    retryConflict(mutationId: string): Promise<void>
    paidCharge(id: string): Promise<void>
    batchPayCharges(amount: number): Promise<BatchPaymentOutcome | null>
    createCategory(name: string, monthlyBudget: number): Promise<void>
    updateCategory(
        id: string,
        name: string,
        monthlyBudget: number,
    ): Promise<void>
    deleteCategory(id: string): Promise<void>
    setPageSize(size: number): void
}

const syncRequests = new Map<string, Promise<void>>()
const syncReruns = new Set<string>()
const enqueueRequests = new Map<string, Promise<void>>()
const POSTGRES_INTEGER_MAX = 2_147_483_647
const MAX_CHARGE_NAME_LENGTH = 500
const MAX_CATEGORY_NAME_LENGTH = 60
let legacyStorageCleaned = false
let fetchGeneration = 0
let syncChannel: BroadcastChannel | null = null
let authChannel: BroadcastChannel | null = null

class SyncIdentityError extends Error {}

async function serializeCardEnqueue<T>(
    key: string,
    operation: () => Promise<T>,
) {
    const previous = enqueueRequests.get(key) ?? Promise.resolve()
    const run = previous.catch(() => undefined).then(async () => {
        if (typeof navigator === 'undefined' || !navigator.locks) {
            return await operation()
        }

        let result!: T
        await navigator.locks.request(
            `pagora-enqueue:${key}`,
            async () => {
                result = await operation()
            },
        )
        return result
    })
    const tail = run.then(
        () => undefined,
        () => undefined,
    )
    enqueueRequests.set(key, tail)
    try {
        return await run
    } finally {
        if (enqueueRequests.get(key) === tail) enqueueRequests.delete(key)
    }
}

function cleanupLegacyStorage() {
    if (legacyStorageCleaned || typeof localStorage === 'undefined') return
    legacyStorageCleaned = true
    localStorage.removeItem('info-storage')
}

function readPageSize() {
    if (typeof localStorage === 'undefined') return 10
    const value = Number(localStorage.getItem('pagora-page-size'))
    return Number.isInteger(value) && value > 0 ? value : 10
}

function localDateOnly() {
    const date = new Date()
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-')
}

type PendingBatchPayment = {
    requestId: string
    amount: number
    asOfDate: string
}

const pendingBatchPayments = new Map<string, PendingBatchPayment>()

function batchPaymentStorageKey(userId: string, cardId: string) {
    return `pagora-payment:${userId}:${cardId}`
}

function getOrCreateBatchPaymentRequest(
    userId: string,
    cardId: string,
    amount: number,
): PendingBatchPayment {
    const asOfDate = localDateOnly()
    const key = batchPaymentStorageKey(userId, cardId)
    if (typeof localStorage !== 'undefined') {
        try {
            const parsed = JSON.parse(
                localStorage.getItem(key) ?? 'null',
            ) as Partial<PendingBatchPayment> | null
            if (
                parsed &&
                typeof parsed.requestId === 'string' &&
                Number.isSafeInteger(parsed.amount) &&
                (parsed.amount ?? 0) > 0 &&
                isDateOnly(parsed.asOfDate)
            ) {
                const request = {
                    requestId: parsed.requestId,
                    amount: parsed.amount as number,
                    asOfDate: parsed.asOfDate,
                }
                pendingBatchPayments.set(key, request)
                return request
            }
        } catch {
            try {
                localStorage.removeItem(key)
            } catch {
                // Fall through to the in-memory copy.
            }
        }
    }

    const inMemory = pendingBatchPayments.get(key)
    if (inMemory) return inMemory

    const request = {
        requestId: crypto.randomUUID(),
        amount,
        asOfDate,
    }
    pendingBatchPayments.set(key, request)
    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.setItem(key, JSON.stringify(request))
        } catch {
            // The server-side idempotency key still protects this attempt.
        }
    }
    return request
}

function clearBatchPaymentRequest(
    userId: string,
    cardId: string,
    requestId: string,
) {
    const key = batchPaymentStorageKey(userId, cardId)
    if (pendingBatchPayments.get(key)?.requestId === requestId) {
        pendingBatchPayments.delete(key)
    }
    if (typeof localStorage === 'undefined') return
    try {
        const parsed = JSON.parse(
            localStorage.getItem(key) ?? 'null',
        ) as Partial<PendingBatchPayment> | null
        if (parsed?.requestId === requestId) {
            localStorage.removeItem(key)
        }
    } catch {
        try {
            localStorage.removeItem(key)
        } catch {
            // The matching in-memory request was already cleared.
        }
    }
}

function deserializeCategory(
    category: SerializedChargeCategory,
): ChargeCategory {
    return {
        ...category,
        created_at: new Date(category.created_at),
        updated_at: new Date(category.updated_at),
    }
}

function serializeCategory(
    category: ChargeCategory,
): SerializedChargeCategory {
    return {
        ...category,
        created_at: category.created_at.toISOString(),
        updated_at: category.updated_at.toISOString(),
    }
}

function deserializeCharge(charge: SerializedCharge): ChargeWithCategory {
    const kind = charge.kind ?? 'single'
    const scheduledFor =
        charge.scheduled_for ?? charge.created_at.slice(0, 10)
    return {
        ...charge,
        kind,
        installment_parent_id:
            kind === 'installment'
                ? (charge.installment_parent_id ?? null)
                : null,
        installment_number:
            kind === 'installment'
                ? (charge.installment_number ?? null)
                : null,
        installment_count:
            kind === 'single'
                ? null
                : (charge.installment_count ?? null),
        scheduled_for: new Date(`${scheduledFor}T00:00:00.000Z`),
        created_at: new Date(charge.created_at),
        updated_at: new Date(charge.updated_at),
        category: charge.category
            ? deserializeCategory(charge.category)
            : null,
    }
}

function serializeCharge(charge: ChargeWithCategory): SerializedCharge {
    return {
        ...charge,
        scheduled_for: charge.scheduled_for.toISOString().slice(0, 10),
        created_at: charge.created_at.toISOString(),
        updated_at: charge.updated_at.toISOString(),
        category: charge.category
            ? serializeCategory(charge.category)
            : null,
    }
}

function runtimeDateFromDateOnly(value: string) {
    return new Date(`${value}T00:00:00.000Z`)
}

function occurredDateOnly(value: string) {
    return new Date(value).toISOString().slice(0, 10)
}

function isCardAccess(value: unknown): value is CardAccessLevel {
    return (
        value === 'none' ||
        value === 'read' ||
        value === 'write' ||
        value === 'owner'
    )
}

function deserializeCache(cache: StoredCardCache): RuntimeCardCache | null {
    try {
        if (
            !isStoredCardCache(cache) ||
            typeof cache.userId !== 'string' ||
            typeof cache.cardId !== 'string' ||
            cache.key !== getCardCacheKey(cache.userId, cache.cardId) ||
            !Array.isArray(cache.charges) ||
            !Array.isArray(cache.categories) ||
            !Array.isArray(cache.summary)
        ) {
            return null
        }

        const runtime = {
            userId: cache.userId,
            cardId: cache.cardId,
            cardAccess: isCardAccess(cache.cardAccess)
                ? cache.cardAccess
                : ('none' as const),
            snapshotReady:
                cache.snapshotReady === true ||
                (cache.snapshotReady === undefined &&
                    cache.cursor !== null),
            cursor: cache.cursor,
            charges: cache.charges.map(deserializeCharge),
            categories: cache.categories.map(deserializeCategory),
            summary: cache.summary,
        }

        const invalid =
            (runtime.cursor !== null &&
                (!Number.isSafeInteger(runtime.cursor) ||
                    runtime.cursor < 0)) ||
            runtime.charges.some(
                (charge) =>
                    typeof charge.id !== 'string' ||
                    charge.card_id !== runtime.cardId ||
                    !Number.isSafeInteger(charge.revision) ||
                    charge.revision < 0 ||
                    Number.isNaN(charge.scheduled_for.getTime()) ||
                    Number.isNaN(charge.created_at.getTime()) ||
                    Number.isNaN(charge.updated_at.getTime()) ||
                    (charge.category !== null &&
                        (charge.category.card_id !== runtime.cardId ||
                            Number.isNaN(
                                charge.category.created_at.getTime(),
                            ) ||
                            Number.isNaN(
                                charge.category.updated_at.getTime(),
                            ))),
            ) ||
            runtime.categories.some(
                (category) =>
                    typeof category.id !== 'string' ||
                    category.card_id !== runtime.cardId ||
                    Number.isNaN(category.created_at.getTime()) ||
                    Number.isNaN(category.updated_at.getTime()),
            ) ||
            runtime.summary.some(
                (entry) =>
                    typeof entry.date !== 'string' ||
                    typeof entry.charges !== 'number' ||
                    typeof entry.payments !== 'number',
            )

        return invalid ? null : runtime
    } catch {
        return null
    }
}

function serializeCache(cache: RuntimeCardCache): StoredCardCache {
    return {
        key: getCardCacheKey(cache.userId, cache.cardId),
        userId: cache.userId,
        cardId: cache.cardId,
        cardAccess: cache.cardAccess,
        snapshotReady: cache.snapshotReady,
        cursor: cache.cursor,
        charges: cache.charges.map(serializeCharge),
        categories: cache.categories.map(serializeCategory),
        summary: cache.summary,
        updatedAt: Date.now(),
    }
}

function emptyCache(userId: string, cardId: string): RuntimeCardCache {
    return {
        userId,
        cardId,
        cardAccess: 'none',
        snapshotReady: false,
        cursor: null,
        charges: [],
        categories: [],
        summary: [],
    }
}

function activeCache(state: InfoStore): RuntimeCardCache | null {
    if (!state.activeUserId || !state.activeCardId) return null
    return {
        userId: state.activeUserId,
        cardId: state.activeCardId,
        cardAccess: state.cardAccess,
        snapshotReady: state.cardSnapshotReady,
        cursor: state.syncCursor,
        charges: state.charges,
        categories: state.categories,
        summary: state.summary,
    }
}

async function persistActiveCache(state: InfoStore) {
    const cache = activeCache(state)
    if (cache) await writeCardCache(serializeCache(cache))
}

function rebuildChargeTotals(
    charges: ChargeWithCategory[],
    previous: DailySummary[],
) {
    const values = new Map(
        previous.map((entry) => [
            entry.date,
            { date: entry.date, payments: entry.payments, charges: 0 },
        ]),
    )

    for (const charge of charges) {
        if (!isAccountingCharge(charge)) continue
        const date = charge.scheduled_for.toISOString().slice(0, 10)
        const entry = values.get(date) ?? {
            date,
            payments: 0,
            charges: 0,
        }
        entry.charges += charge.amount / 100
        values.set(date, entry)
    }

    return Array.from(values.values())
        .filter((entry) => entry.charges !== 0 || entry.payments !== 0)
        .sort((a, b) => a.date.localeCompare(b.date))
}

function applySyncPayload(
    cache: RuntimeCardCache,
    payload: CardSyncPayload,
): RuntimeCardCache {
    if (payload.mode === 'snapshot') {
        return {
            ...cache,
            cardAccess: payload.access,
            snapshotReady: true,
            cursor: payload.cursor,
            charges: payload.charges.map(deserializeCharge),
            categories: payload.categories.map(deserializeCategory),
            summary: payload.summary ?? [],
        }
    }

    const charges = new Map(cache.charges.map((charge) => [charge.id, charge]))
    const categories = new Map(
        cache.categories.map((category) => [category.id, category]),
    )

    for (const id of payload.deletedChargeIds) {
        const current = charges.get(id)
        if (!current || current.revision <= payload.cursor) charges.delete(id)
    }
    for (const charge of payload.charges) {
        const deserialized = deserializeCharge(charge)
        const current = charges.get(deserialized.id)
        if (!current || current.revision <= deserialized.revision) {
            charges.set(deserialized.id, deserialized)
        }
    }

    for (const id of payload.deletedCategoryIds) categories.delete(id)
    for (const category of payload.categories) {
        const deserialized = deserializeCategory(category)
        categories.set(deserialized.id, deserialized)
    }

    const deletedCategories = new Set(payload.deletedCategoryIds)
    const nextCharges = Array.from(charges.values(), (charge) => {
        if (charge.category_id && deletedCategories.has(charge.category_id)) {
            return { ...charge, category_id: null, category: null }
        }
        const category = charge.category_id
            ? categories.get(charge.category_id)
            : null
        return category ? { ...charge, category } : charge
    }).sort(
        (a, b) =>
            b.scheduled_for.getTime() - a.scheduled_for.getTime() ||
            b.created_at.getTime() - a.created_at.getTime(),
    )

    const hasNewerLocalCharge = cache.charges.some(
        (charge) => charge.revision > payload.cursor,
    )

    return {
        ...cache,
        cardAccess: payload.access,
        cursor: payload.cursor,
        charges: nextCharges,
        categories: Array.from(categories.values()).sort((a, b) =>
            a.name.localeCompare(b.name),
        ),
        summary:
            hasNewerLocalCharge || payload.summary === null
                ? cache.summary
                : payload.summary,
    }
}

function mutationChargeId(mutation: ClientMutation) {
    if (mutation.type === 'charge.create') return mutation.charge.id
    if (
        mutation.type === 'installment.create' ||
        mutation.type === 'installment.update'
    ) {
        return mutation.plan.id
    }
    if (mutation.type === 'installment.delete') return mutation.parentId
    return mutation.chargeId
}

function mutationChargeIds(mutation: ClientMutation) {
    if (
        mutation.type === 'installment.create' ||
        mutation.type === 'installment.update'
    ) {
        return [mutation.plan.id, ...mutation.plan.installmentIds]
    }
    return [mutationChargeId(mutation)]
}

function materializePendingMutations(
    cache: RuntimeCardCache,
    pending: StoredOutboxMutation[],
): RuntimeCardCache {
    const charges = new Map(cache.charges.map((charge) => [charge.id, charge]))
    const categories = new Map(
        cache.categories.map((category) => [category.id, category]),
    )

    function resolveCategory(
        mutation: ClientMutation,
        categoryId: string | null | undefined,
        categoryName: string | null | undefined,
    ) {
        const name = categoryName?.trim()
        if (!name) return null

        const existing =
            (categoryId ? categories.get(categoryId) : null) ??
            Array.from(categories.values()).find(
                (category) => category.name === name,
            )
        if (existing) return existing

        const occurredAt = new Date(mutation.occurredAt)
        const category: ChargeCategory = {
            id: categoryId ?? `local-category:${mutation.mutationId}`,
            card_id: cache.cardId,
            name,
            monthly_budget: 0,
            created_at: occurredAt,
            updated_at: occurredAt,
        }
        categories.set(category.id, category)
        return category
    }

    for (const record of pending) {
        const mutation = record.mutation
        if (mutation.type === 'charge.create') {
            const category = resolveCategory(
                mutation,
                mutation.charge.categoryId,
                mutation.charge.categoryName,
            )
            const occurredAt = new Date(mutation.occurredAt)
            const current = charges.get(mutation.charge.id)
            charges.set(mutation.charge.id, {
                id: mutation.charge.id,
                card_id: cache.cardId,
                name: mutation.charge.name,
                amount: mutation.charge.amount,
                paid: current?.paid ?? 0,
                kind: 'single',
                installment_parent_id: null,
                installment_number: null,
                installment_count: null,
                scheduled_for:
                    current?.scheduled_for ??
                    runtimeDateFromDateOnly(
                        occurredDateOnly(mutation.occurredAt),
                    ),
                category_id: category?.id ?? null,
                category,
                revision: current?.revision ?? cache.cursor ?? 0,
                created_at: current?.created_at ?? occurredAt,
                updated_at: occurredAt,
            })
            continue
        }

        if (mutation.type === 'charge.update') {
            const current = charges.get(mutation.chargeId)
            if (!current || current.kind !== 'single') continue
            const category = resolveCategory(
                mutation,
                mutation.categoryId,
                mutation.categoryName,
            )
            charges.set(mutation.chargeId, {
                ...current,
                name: mutation.name,
                amount: mutation.amount,
                category_id: category?.id ?? null,
                category,
                updated_at: new Date(mutation.occurredAt),
            })
            continue
        }

        if (mutation.type === 'charge.delete') {
            const current = charges.get(mutation.chargeId)
            if (current?.kind === 'single') {
                charges.delete(mutation.chargeId)
            }
            continue
        }

        if (
            mutation.type === 'installment.create' ||
            mutation.type === 'installment.update'
        ) {
            const plan = mutation.plan
            const category = resolveCategory(
                mutation,
                plan.categoryId,
                plan.categoryName,
            )
            const occurredAt = new Date(mutation.occurredAt)
            const currentParent = charges.get(plan.id)
            const schedule = buildInstallmentSchedule({
                name: plan.name,
                amount: plan.amount,
                count: plan.count,
                firstInstallmentDate: plan.firstInstallmentDate,
            })
            const desiredIds = new Set(plan.installmentIds)

            for (const charge of Array.from(charges.values())) {
                if (
                    charge.installment_parent_id === plan.id &&
                    !desiredIds.has(charge.id)
                ) {
                    charges.delete(charge.id)
                }
            }

            charges.set(plan.id, {
                id: plan.id,
                card_id: cache.cardId,
                name: plan.name,
                amount: plan.amount,
                paid: currentParent?.paid ?? 0,
                kind: 'installment_parent',
                installment_parent_id: null,
                installment_number: null,
                installment_count: plan.count,
                scheduled_for: runtimeDateFromDateOnly(
                    plan.firstInstallmentDate,
                ),
                category_id: category?.id ?? null,
                category,
                revision:
                    currentParent?.revision ?? cache.cursor ?? 0,
                created_at: currentParent?.created_at ?? occurredAt,
                updated_at: occurredAt,
            })

            schedule.forEach((installment, index) => {
                const id = plan.installmentIds[index]
                const current = charges.get(id)
                charges.set(id, {
                    id,
                    card_id: cache.cardId,
                    name: installment.name,
                    amount: installment.amount,
                    paid: current?.paid ?? 0,
                    kind: 'installment',
                    installment_parent_id: plan.id,
                    installment_number:
                        installment.installmentNumber,
                    installment_count: installment.installmentCount,
                    scheduled_for: runtimeDateFromDateOnly(
                        installment.scheduledFor,
                    ),
                    category_id: category?.id ?? null,
                    category,
                    revision:
                        current?.revision ??
                        currentParent?.revision ??
                        cache.cursor ??
                        0,
                    created_at:
                        current?.created_at ??
                        currentParent?.created_at ??
                        occurredAt,
                    updated_at: occurredAt,
                })
            })
            continue
        }

        charges.delete(mutation.parentId)
        for (const charge of Array.from(charges.values())) {
            if (charge.installment_parent_id === mutation.parentId) {
                charges.delete(charge.id)
            }
        }
    }

    const nextCharges = Array.from(charges.values()).sort(
        (left, right) =>
            right.scheduled_for.getTime() -
                left.scheduled_for.getTime() ||
            right.created_at.getTime() - left.created_at.getTime(),
    )
    return {
        ...cache,
        charges: nextCharges,
        categories: Array.from(categories.values()).sort((left, right) =>
            left.name.localeCompare(right.name),
        ),
        summary: rebuildChargeTotals(nextCharges, cache.summary),
    }
}

function materializeMutation(
    cache: RuntimeCardCache,
    mutation: ClientMutation,
) {
    return materializePendingMutations(cache, [
        {
            mutationId: mutation.mutationId,
            cardKey: getCardCacheKey(cache.userId, cache.cardId),
            userId: cache.userId,
            cardId: cache.cardId,
            mutation,
            queuedAt: Date.now(),
            attempts: 0,
            lastAttemptAt: null,
            lastError: null,
        },
    ])
}

function applyMutationResults(
    cache: RuntimeCardCache,
    results: ClientMutationResult[],
) {
    const charges = new Map(cache.charges.map((charge) => [charge.id, charge]))
    const categories = new Map(
        cache.categories.map((category) => [category.id, category]),
    )

    for (const result of results) {
        if (
            result.status === 'applied' &&
            cache.cursor !== null &&
            result.cursor < cache.cursor
        ) {
            continue
        }
        if (result.status === 'applied') {
            const deletedIds = [
                ...(result.deletedChargeId
                    ? [result.deletedChargeId]
                    : []),
                ...(result.deletedChargeIds ?? []),
            ]
            for (const deletedId of new Set(deletedIds)) {
                const current = charges.get(deletedId)
                if (!current || current.revision <= result.cursor) {
                    charges.delete(deletedId)
                }
            }

            const upserts = [
                ...(result.charge ? [result.charge] : []),
                ...(result.charges ?? []),
            ]
            for (const serialized of new Map(
                upserts.map((charge) => [charge.id, charge]),
            ).values()) {
                const charge = deserializeCharge(serialized)
                const current = charges.get(charge.id)
                if (!current || current.revision <= charge.revision) {
                    charges.set(charge.id, charge)
                    if (charge.category) {
                        categories.set(charge.category.id, charge.category)
                    }
                }
            }
        } else if (result.status === 'conflict') {
            const serverCharges =
                result.serverCharges ?? [result.serverCharge]
            for (const serialized of serverCharges) {
                const charge = deserializeCharge(serialized)
                const current = charges.get(charge.id)
                if (!current || current.revision <= charge.revision) {
                    charges.set(charge.id, charge)
                    if (charge.category) {
                        categories.set(charge.category.id, charge.category)
                    }
                }
            }
        }
    }

    const nextCharges = Array.from(charges.values()).sort(
        (left, right) =>
            right.scheduled_for.getTime() -
                left.scheduled_for.getTime() ||
            right.created_at.getTime() - left.created_at.getTime(),
    )
    return {
        ...cache,
        charges: nextCharges,
        categories: Array.from(categories.values()).sort((left, right) =>
            left.name.localeCompare(right.name),
        ),
        summary: rebuildChargeTotals(nextCharges, cache.summary),
    }
}

function isPushResponse(value: unknown): value is PushCardMutationsResponse {
    if (!value || typeof value !== 'object' || !('results' in value)) {
        return false
    }
    const results = (value as { results?: unknown }).results
    if (!Array.isArray(results)) return false
    const statuses = new Set([
        'applied',
        'conflict',
        'gone',
        'rejected',
        'dependency-failed',
    ])
    return results.every(
        (result) =>
            result !== null &&
            typeof result === 'object' &&
            'mutationId' in result &&
            typeof result.mutationId === 'string' &&
            'status' in result &&
            typeof result.status === 'string' &&
            statuses.has(result.status),
    )
}

async function fetchWithSessionRetry(url: string, init: RequestInit) {
    let response = await fetch(url, init)
    if (response.status === 401) response = await fetch(url, init)
    return response
}

function ensureSyncChannel() {
    if (typeof BroadcastChannel === 'undefined') return
    if (!syncChannel) {
        syncChannel = new BroadcastChannel('pagora-card-sync')
        syncChannel.onmessage = (event: MessageEvent<unknown>) => {
            const data = event.data
            if (
                !data ||
                typeof data !== 'object' ||
                !('userId' in data) ||
                !('cardId' in data) ||
                typeof data.userId !== 'string' ||
                typeof data.cardId !== 'string'
            ) {
                return
            }
            const key = getCardCacheKey(data.userId, data.cardId)
            if (syncRequests.has(key)) syncReruns.add(key)
            else void useInfo.getState().syncCard(data.cardId, data.userId)
        }
    }
    if (!authChannel) {
        authChannel = new BroadcastChannel('pagora-auth')
        authChannel.onmessage = (event: MessageEvent<unknown>) => {
            const data = event.data
            const state = useInfo.getState()
            if (
                !data ||
                typeof data !== 'object' ||
                !('type' in data) ||
                data.type !== 'logout' ||
                !('userId' in data) ||
                typeof data.userId !== 'string' ||
                (state.activeUserId !== data.userId &&
                    state.user?.id !== data.userId)
            ) {
                return
            }

            fetchGeneration += 1
            void clearUserOfflineView(data.userId).catch(() => undefined)
            useInfo.setState({
                user: null,
                card: null,
                cardAccess: 'none',
                activeUserId: null,
                activeCardId: null,
                charges: [],
                categories: [],
                summary: [],
                syncCursor: null,
                cardSnapshotReady: false,
                syncStatus: 'unauthorized',
                pendingMutationCount: 0,
                syncConflicts: [],
            })
            window.setTimeout(() => {
                window.location.replace('/auth/login')
            }, 250)
        }
    }
}

function broadcastCardChange(userId: string, cardId: string) {
    ensureSyncChannel()
    syncChannel?.postMessage({ userId, cardId })
}

function isActiveCard(state: InfoStore, userId: string, cardId: string) {
    return state.activeUserId === userId && state.activeCardId === cardId
}

function syncAfterMutation(userId: string, cardId: string) {
    const key = getCardCacheKey(userId, cardId)
    if (syncRequests.has(key)) {
        syncReruns.add(key)
    } else {
        void useInfo.getState().syncCard(cardId, userId)
    }
    broadcastCardChange(userId, cardId)
}

export const useInfo = create<InfoStore>((set, get) => ({
    user: null,
    card: null,
    cards: [],
    ownCards: [],
    sharedWithMeCards: [],
    sharedByMeCards: [],
    cardAccess: 'none',
    pendingInvitations: 0,
    charges: [],
    categories: [],
    summary: [],
    pageSize: readPageSize(),
    activeUserId: null,
    activeCardId: null,
    syncCursor: null,
    cardSnapshotReady: false,
    syncStatus: 'idle',
    pendingMutationCount: 0,
    syncConflicts: [],

    hydrateOfflineSession: (session, cardId) => {
        const card = session.cards.find((item) => item.id === cardId)
        if (!card || session.user.id !== session.userId) return false

        fetchGeneration += 1
        set({
            user: session.user,
            card,
            cards: session.cards,
            ownCards: session.cards.filter((item) => item.access === 'owner'),
            sharedWithMeCards: session.cards.filter(
                (item) => item.access === 'read' || item.access === 'write',
            ),
            sharedByMeCards: [],
            cardAccess: card.access,
            pendingInvitations: 0,
            charges: [],
            categories: [],
            summary: [],
            activeUserId: session.userId,
            activeCardId: cardId,
            syncCursor: null,
            cardSnapshotReady: false,
            syncStatus: 'offline',
            pendingMutationCount: 0,
            syncConflicts: [],
        })
        return true
    },

    fetch: async (cardId, userId) => {
        cleanupLegacyStorage()
        ensureSyncChannel()
        const generation = ++fetchGeneration

        const alreadyActive = isActiveCard(get(), userId, cardId)
        if (!alreadyActive) {
            set({
                activeUserId: userId,
                activeCardId: cardId,
                card: null,
                cardAccess: 'none',
                syncCursor: null,
                cardSnapshotReady: false,
                syncStatus: 'idle',
                charges: [],
                categories: [],
                summary: [],
                pendingMutationCount: 0,
                syncConflicts: [],
            })
        }

        const metadataRequest = fetchInfoAction(cardId)
        const [stored, pending, conflicts] = await Promise.all([
            readCardCache(userId, cardId),
            listPendingCardMutations(userId, cardId),
            listCardMutationConflicts(userId, cardId),
        ])
        const cache = stored ? deserializeCache(stored) : null
        if (
            cache &&
            generation === fetchGeneration &&
            isActiveCard(get(), userId, cardId)
        ) {
            const visibleCache = materializePendingMutations(cache, pending)
            set({
                cardAccess: visibleCache.cardAccess,
                syncCursor: visibleCache.cursor,
                cardSnapshotReady: visibleCache.snapshotReady,
                charges: visibleCache.charges,
                categories: visibleCache.categories,
                summary: visibleCache.summary,
                pendingMutationCount: pending.length,
                syncConflicts: conflicts,
            })
        } else if (stored && !cache) {
            await deleteCardCache(userId, cardId)
        }

        const syncRequest = get().syncCard(cardId, userId)
        const metadata = await metadataRequest.catch(() => null)
        if (
            metadata &&
            metadata.user.id === userId &&
            generation === fetchGeneration &&
            isActiveCard(get(), userId, cardId)
        ) {
            set({
                user: metadata.user,
                card: metadata.card ?? null,
                cards: metadata.cards,
                ownCards: metadata.ownCards,
                sharedWithMeCards: metadata.sharedWithMeCards,
                sharedByMeCards: metadata.sharedByMeCards,
                pendingInvitations: metadata.pendingInvitations,
            })
        }
        await syncRequest

        if (
            metadata?.card &&
            metadata.user.id === userId &&
            generation === fetchGeneration &&
            isActiveCard(get(), userId, cardId)
        ) {
            const cache = activeCache(get())
            if (cache?.snapshotReady) {
                await saveOfflineReadyCard(serializeCache(cache), {
                    userId,
                    user: metadata.user,
                    cards: metadata.cards,
                    activeCardId: cardId,
                }).catch(() => undefined)
            }
        }
    },

    syncCard: async (cardId, userId) => {
        const key = getCardCacheKey(userId, cardId)
        const currentRequest = syncRequests.get(key)
        if (currentRequest) return await currentRequest

        const runSync = async () => {
            async function loadCache() {
                const state = get()
                if (isActiveCard(state, userId, cardId)) {
                    return activeCache(state) ?? emptyCache(userId, cardId)
                }

                const stored = await readCardCache(userId, cardId)
                const deserialized = stored ? deserializeCache(stored) : null
                if (stored && !deserialized) {
                    await deleteCardCache(userId, cardId)
                }
                return deserialized ?? emptyCache(userId, cardId)
            }

            async function pull(cache: RuntimeCardCache) {
                const search =
                    cache.cursor === null ? '' : `?cursor=${cache.cursor}`
                const response = await fetchWithSessionRetry(
                    `/api/cards/${encodeURIComponent(cardId)}/sync${search}`,
                    {
                        cache: 'no-store',
                        headers: { Accept: 'application/json' },
                        redirect: 'manual',
                    },
                )
                if (
                    response.status !== 401 &&
                    response.headers.get('X-Sync-User') !== userId
                ) {
                    throw new SyncIdentityError(
                        'The signed-in user changed during synchronization.',
                    )
                }
                if (response.status === 204) {
                    const access = response.headers.get('X-Card-Access')
                    if (!isCardAccess(access) || access === 'none') {
                        throw new Error('invalid card access response')
                    }
                    return { status: 'unchanged' as const, access }
                }
                if (response.status === 401) {
                    return { status: 'unauthorized' as const }
                }
                if (response.status === 404) {
                    return { status: 'not-found' as const }
                }
                if (!response.ok) throw new Error('card sync failed')
                const payload = (await response.json()) as CardSyncPayload
                if (!isCardAccess(payload.access)) {
                    throw new Error('invalid card sync payload')
                }
                return {
                    status: 'ok' as const,
                    payload,
                }
            }

            async function publishCache(
                cache: RuntimeCardCache,
                pending: StoredOutboxMutation[],
                conflicts: StoredMutationConflict[],
                status: SyncStatus,
            ) {
                const visible = materializePendingMutations(cache, pending)
                await writeCardCache(serializeCache(visible))
                if (isActiveCard(get(), userId, cardId)) {
                    set({
                        cardAccess: visible.cardAccess,
                        charges: visible.charges,
                        categories: visible.categories,
                        summary: visible.summary,
                        syncCursor: visible.cursor,
                        cardSnapshotReady: visible.snapshotReady,
                        syncStatus: status,
                        pendingMutationCount: pending.length,
                        syncConflicts: conflicts,
                    })
                }
                return visible
            }

            async function handleUnavailable(
                pending: StoredOutboxMutation[],
            ) {
                for (const record of pending) {
                    await saveCardMutationConflict(
                        userId,
                        cardId,
                        record.mutation,
                        {
                            mutationId: record.mutationId,
                            type: record.mutation.type,
                            status: 'rejected',
                            reason: 'Card access was removed before this change synchronized.',
                        },
                    )
                }
                await deleteCardCache(userId, cardId)
                const conflicts = await listCardMutationConflicts(
                    userId,
                    cardId,
                )
                if (isActiveCard(get(), userId, cardId)) {
                    set({
                        card: null,
                        cardAccess: 'none',
                        charges: [],
                        categories: [],
                        summary: [],
                        syncCursor: null,
                        cardSnapshotReady: false,
                        syncStatus: 'unavailable',
                        pendingMutationCount: 0,
                        syncConflicts: conflicts,
                    })
                }
            }

            async function handleReadOnly(
                cache: RuntimeCardCache,
                pending: StoredOutboxMutation[],
            ) {
                for (const record of pending) {
                    await saveCardMutationConflict(
                        userId,
                        cardId,
                        record.mutation,
                        {
                            mutationId: record.mutationId,
                            type: record.mutation.type,
                            status: 'rejected',
                            reason: 'Write access was removed before this change synchronized.',
                        },
                    )
                }

                let canonical: RuntimeCardCache = {
                    ...cache,
                    cardAccess: 'read' as const,
                    cursor: null,
                }
                const pulled = await pull(canonical)
                if (pulled.status === 'ok') {
                    canonical = applySyncPayload(canonical, pulled.payload)
                } else if (pulled.status === 'not-found') {
                    await handleUnavailable([])
                    return
                } else if (pulled.status === 'unauthorized') {
                    if (isActiveCard(get(), userId, cardId)) {
                        set({ syncStatus: 'unauthorized' })
                    }
                    return
                }

                const conflicts = await listCardMutationConflicts(
                    userId,
                    cardId,
                )
                await publishCache(canonical, [], conflicts, 'synced')
            }

            do {
                syncReruns.delete(key)
                let cache = await loadCache()
                let [pending, conflicts] = await Promise.all([
                    listPendingCardMutations(userId, cardId),
                    listCardMutationConflicts(userId, cardId),
                ])

                if (isActiveCard(get(), userId, cardId)) {
                    set({
                        syncStatus: 'syncing',
                        pendingMutationCount: pending.length,
                        syncConflicts: conflicts,
                    })
                }

                if (
                    typeof navigator !== 'undefined' &&
                    navigator.onLine === false
                ) {
                    await publishCache(cache, pending, conflicts, 'offline')
                    break
                }

                try {
                    const pulled = await pull(cache)
                    if (pulled.status === 'unauthorized') {
                        if (isActiveCard(get(), userId, cardId)) {
                            set({ syncStatus: 'unauthorized' })
                        }
                        break
                    }
                    if (pulled.status === 'not-found') {
                        await handleUnavailable(pending)
                        break
                    }
                    if (pulled.status === 'ok') {
                        const latest = get()
                        if (isActiveCard(latest, userId, cardId)) {
                            cache = activeCache(latest) ?? cache
                        }
                        cache = applySyncPayload(cache, pulled.payload)
                    } else if (pulled.status === 'unchanged') {
                        cache = { ...cache, cardAccess: pulled.access }
                    }

                    ;[pending, conflicts] = await Promise.all([
                        listPendingCardMutations(userId, cardId),
                        listCardMutationConflicts(userId, cardId),
                    ])
                    cache = await publishCache(
                        cache,
                        pending,
                        conflicts,
                        'syncing',
                    )

                    if (pending.length > 0) {
                        const sent = pending.slice(0, 50)
                        const sentById = new Map(
                            sent.map((record) => [
                                record.mutationId,
                                record,
                            ]),
                        )
                        const response = await fetchWithSessionRetry(
                            `/api/cards/${encodeURIComponent(cardId)}/sync`,
                            {
                                method: 'POST',
                                cache: 'no-store',
                                redirect: 'manual',
                                headers: {
                                    Accept: 'application/json',
                                    'Content-Type': 'application/json',
                                    'X-Expected-Sync-User': userId,
                                },
                                body: JSON.stringify({
                                    mutations: sent.map(
                                        (record) => record.mutation,
                                    ),
                                }),
                            },
                        )

                        if (
                            response.status !== 401 &&
                            response.headers.get('X-Sync-User') !== userId
                        ) {
                            if (isActiveCard(get(), userId, cardId)) {
                                set({ syncStatus: 'unauthorized' })
                            }
                            break
                        }

                        if (response.status === 401) {
                            await markCardMutationsAttempted(
                                userId,
                                cardId,
                                Array.from(sentById.keys()),
                                'Session expired',
                            )
                            if (isActiveCard(get(), userId, cardId)) {
                                set({ syncStatus: 'unauthorized' })
                            }
                            break
                        }
                        if (response.status === 404) {
                            await handleUnavailable(pending)
                            break
                        }
                        if (response.status === 403) {
                            await handleReadOnly(cache, pending)
                            break
                        }
                        if (!response.ok && response.status !== 400) {
                            throw new Error(
                                `card mutation push failed (${response.status})`,
                            )
                        }

                        const body: unknown =
                            response.status === 400
                                ? {
                                      results: sent.map((record) => ({
                                          mutationId: record.mutationId,
                                          type: record.mutation.type,
                                          status: 'rejected' as const,
                                          reason: 'The queued command is invalid for this server version.',
                                      })),
                                  }
                                : await response.json()
                        if (!isPushResponse(body)) {
                            throw new Error('invalid card mutation response')
                        }

                        const seen = new Set<string>()
                        const results = body.results.filter((result) => {
                            const queued = sentById.get(result.mutationId)
                            if (
                                !queued ||
                                queued.mutation.type !== result.type ||
                                seen.has(result.mutationId)
                            ) {
                                return false
                            }
                            seen.add(result.mutationId)
                            return true
                        })
                        if (seen.size !== sent.length) {
                            throw new Error(
                                'card mutation response omitted a command',
                            )
                        }

                        await markCardMutationsAttempted(
                            userId,
                            cardId,
                            Array.from(sentById.keys()),
                        )
                        const acknowledged: string[] = []
                        let forceSnapshot = false
                        for (const result of results) {
                            const record = sentById.get(result.mutationId)!
                            const requestedCategoryId =
                                record.mutation.type === 'charge.create'
                                    ? record.mutation.charge.categoryId
                                    : record.mutation.type === 'charge.update'
                                      ? record.mutation.categoryId
                                      : record.mutation.type ===
                                              'installment.create' ||
                                            record.mutation.type ===
                                                'installment.update'
                                        ? record.mutation.plan.categoryId
                                       : null
                            const returnedCharge =
                                result.status === 'applied'
                                    ? (result.charge ??
                                      result.charges?.find(
                                          (charge) =>
                                              charge.id ===
                                              mutationChargeId(
                                                  record.mutation,
                                              ),
                                      ))
                                    : undefined
                            if (
                                result.status === 'applied' &&
                                returnedCharge &&
                                requestedCategoryId &&
                                requestedCategoryId !==
                                    returnedCharge.category_id
                            ) {
                                forceSnapshot = true
                            }
                            if (result.status === 'gone') {
                                forceSnapshot = true
                            }
                            if (
                                result.status === 'applied' ||
                                (result.status === 'gone' &&
                                    (record.mutation.type ===
                                        'charge.delete' ||
                                        record.mutation.type ===
                                            'installment.delete'))
                            ) {
                                acknowledged.push(result.mutationId)
                            } else {
                                forceSnapshot = true
                                await saveCardMutationConflict(
                                    userId,
                                    cardId,
                                    record.mutation,
                                    result,
                                )
                            }
                        }
                        await acknowledgeCardMutations(
                            userId,
                            cardId,
                            acknowledged,
                        )

                        cache = applyMutationResults(cache, results)
                        if (forceSnapshot) cache = { ...cache, cursor: null }
                        ;[pending, conflicts] = await Promise.all([
                            listPendingCardMutations(userId, cardId),
                            listCardMutationConflicts(userId, cardId),
                        ])
                        cache = await publishCache(
                            cache,
                            pending,
                            conflicts,
                            'syncing',
                        )

                        const finalPull = await pull(cache)
                        if (finalPull.status === 'unauthorized') {
                            if (isActiveCard(get(), userId, cardId)) {
                                set({ syncStatus: 'unauthorized' })
                            }
                            break
                        }
                        if (finalPull.status === 'not-found') {
                            await handleUnavailable(pending)
                            break
                        }
                        if (finalPull.status === 'ok') {
                            const latest = get()
                            if (isActiveCard(latest, userId, cardId)) {
                                cache = activeCache(latest) ?? cache
                            }
                            cache = applySyncPayload(
                                cache,
                                finalPull.payload,
                            )
                        } else if (finalPull.status === 'unchanged') {
                            cache = {
                                ...cache,
                                cardAccess: finalPull.access,
                            }
                        }
                    }

                    ;[pending, conflicts] = await Promise.all([
                        listPendingCardMutations(userId, cardId),
                        listCardMutationConflicts(userId, cardId),
                    ])
                    await publishCache(
                        cache,
                        pending,
                        conflicts,
                        'synced',
                    )
                    if (pending.length > 0) syncReruns.add(key)
                } catch (error) {
                    if (error instanceof SyncIdentityError) {
                        if (isActiveCard(get(), userId, cardId)) {
                            set({ syncStatus: 'unauthorized' })
                        }
                        break
                    }
                    await markCardMutationsAttempted(
                        userId,
                        cardId,
                        pending.map((record) => record.mutationId),
                        error instanceof Error ? error.message : 'Sync failed',
                    ).catch(() => undefined)
                    if (isActiveCard(get(), userId, cardId)) {
                        set({
                            syncStatus:
                                typeof navigator !== 'undefined' &&
                                navigator.onLine === false
                                    ? 'offline'
                                    : 'error',
                        })
                    }
                    break
                }
            } while (syncReruns.delete(key))
        }

        const request: Promise<void> =
            typeof navigator !== 'undefined' && navigator.locks
                ? navigator.locks
                      .request(`pagora-sync:${key}`, runSync)
                      .then(() => undefined)
                : runSync()

        syncRequests.set(key, request)
        try {
            await request
        } finally {
            syncRequests.delete(key)
            if (syncReruns.delete(key)) {
                queueMicrotask(() => {
                    void useInfo.getState().syncCard(cardId, userId)
                })
            }
        }
    },

    refreshCards: async () => {
        const sections = await getCardSectionsAction()
        const cards = [...sections.own, ...sections.sharedWithMe]
        set({
            cards,
            ownCards: sections.own,
            sharedWithMeCards: sections.sharedWithMe,
            sharedByMeCards: sections.sharedByMe,
            pendingInvitations: sections.pendingInvitations,
        })
        const state = get()
        if (
            state.user &&
            state.activeUserId === state.user.id &&
            state.activeCardId &&
            cards.some((card) => card.id === state.activeCardId)
        ) {
            const cache = activeCache(state)
            if (cache?.snapshotReady) {
                await saveOfflineReadyCard(serializeCache(cache), {
                    userId: state.user.id,
                    user: state.user,
                    cards,
                    activeCardId: state.activeCardId,
                }).catch(() => undefined)
            }
        }
    },

    createCharge: async (amount, name, categoryName, installment) => {
        const state = get()
        if (state.cardAccess !== 'owner' && state.cardAccess !== 'write') {
            return false
        }
        if (!state.activeCardId || !state.activeUserId) return false
        const trimmedName = name.trim()
        const trimmedCategory = categoryName?.trim() || null
        if (
            !trimmedName ||
            trimmedName.length > MAX_CHARGE_NAME_LENGTH ||
            (trimmedCategory?.length ?? 0) > MAX_CATEGORY_NAME_LENGTH ||
            !Number.isSafeInteger(amount) ||
            amount <= 0 ||
            amount > POSTGRES_INTEGER_MAX ||
            (installment !== undefined &&
                (!isValidInstallmentPlanInput(installment) ||
                    amount < installment.count))
        ) {
            toast.error('El nombre, la categoría o el monto no son válidos.')
            return false
        }

        const userId = state.activeUserId
        const cardId = state.activeCardId
        const key = getCardCacheKey(userId, cardId)
        try {
            return await serializeCardEnqueue(key, async () => {
                const latestState = get()
                let cache = isActiveCard(latestState, userId, cardId)
                    ? (activeCache(latestState) ?? emptyCache(userId, cardId))
                    : null
                if (!cache) {
                    const stored = await readCardCache(userId, cardId)
                    cache = stored
                        ? (deserializeCache(stored) ??
                          emptyCache(userId, cardId))
                        : emptyCache(userId, cardId)
                }

                const normalizedCategory = trimmedCategory
                const existingCategory = normalizedCategory
                    ? cache.categories.find(
                          (category) =>
                              category.name === normalizedCategory,
                      )
                    : null
                const mutationId = crypto.randomUUID()
                const chargeId = crypto.randomUUID()
                const occurredAt = new Date().toISOString()
                const categoryId = normalizedCategory
                    ? (existingCategory?.id ?? crypto.randomUUID())
                    : null
                const mutation:
                    | ChargeCreateMutation
                    | InstallmentCreateMutation = installment
                    ? {
                          mutationId,
                          type: 'installment.create',
                          occurredAt,
                          plan: {
                              id: chargeId,
                              name: trimmedName,
                              amount,
                              categoryId,
                              categoryName: normalizedCategory,
                              ...installment,
                              installmentIds: Array.from(
                                  { length: installment.count },
                                  () => crypto.randomUUID(),
                              ),
                          },
                      }
                    : {
                          mutationId,
                          type: 'charge.create',
                          occurredAt,
                          charge: {
                              id: chargeId,
                              name: trimmedName,
                              amount,
                              categoryId,
                              categoryName: normalizedCategory,
                          },
                      }
                const visible = materializeMutation(cache, mutation)
                await saveOptimisticCardMutation(
                    serializeCache(visible),
                    mutation,
                )
                const pending = await listPendingCardMutations(userId, cardId)
                if (isActiveCard(get(), userId, cardId)) {
                    set({
                        charges: visible.charges,
                        categories: visible.categories,
                        summary: visible.summary,
                        pendingMutationCount: pending.length,
                        syncStatus:
                            typeof navigator !== 'undefined' &&
                            navigator.onLine === false
                                ? 'offline'
                                : get().syncStatus,
                    })
                }
                syncAfterMutation(userId, cardId)
                return true
            })
        } catch {
            toast.error(
                'No se pudo guardar el cambio localmente. Inténtalo de nuevo.',
            )
            return false
        }
    },

    updateCharge: async (id, name, amount, categoryName, installment) => {
        const state = get()
        if (state.cardAccess !== 'owner' && state.cardAccess !== 'write') {
            return false
        }
        if (!state.activeCardId || !state.activeUserId) return false
        const trimmedName = name.trim()
        const trimmedCategory = categoryName?.trim() || null
        if (
            !trimmedName ||
            trimmedName.length > MAX_CHARGE_NAME_LENGTH ||
            (trimmedCategory?.length ?? 0) > MAX_CATEGORY_NAME_LENGTH ||
            !Number.isSafeInteger(amount) ||
            amount <= 0 ||
            amount > POSTGRES_INTEGER_MAX ||
            (installment !== undefined &&
                (!isValidInstallmentPlanInput(installment) ||
                    amount < installment.count))
        ) {
            toast.error('El nombre, la categoría o el monto no son válidos.')
            return false
        }
        const current = state.charges.find((charge) => charge.id === id)
        if (!current) return false
        if (isInstallmentCharge(current)) {
            toast.error('Edita el cargo principal de este plan.')
            return false
        }
        if (
            isInstallmentParentCharge(current) &&
            !isValidInstallmentPlanInput(installment)
        ) {
            toast.error('El plan de mensualidades no es válido.')
            return false
        }

        const userId = state.activeUserId
        const cardId = state.activeCardId
        const key = getCardCacheKey(userId, cardId)
        try {
            return await serializeCardEnqueue(key, async () => {
                const latestPending =
                    await findLatestPendingMutationForCharge(
                        userId,
                        cardId,
                        id,
                    )
                const latestState = get()
                let cache = isActiveCard(latestState, userId, cardId)
                    ? (activeCache(latestState) ?? emptyCache(userId, cardId))
                    : null
                if (!cache) {
                    const stored = await readCardCache(userId, cardId)
                    cache = stored
                        ? (deserializeCache(stored) ??
                          emptyCache(userId, cardId))
                        : emptyCache(userId, cardId)
                }

                const normalizedCategory = trimmedCategory
                const existingCategory = normalizedCategory
                    ? cache.categories.find(
                          (category) =>
                              category.name === normalizedCategory,
                      )
                    : null
                const mutationId = crypto.randomUUID()
                const occurredAt = new Date().toISOString()
                const dependsOn = latestPending
                    ? [latestPending.mutationId]
                    : undefined
                const categoryId = normalizedCategory
                    ? (existingCategory?.id ?? crypto.randomUUID())
                    : null
                let mutation:
                    | ChargeUpdateMutation
                    | InstallmentUpdateMutation
                if (isInstallmentParentCharge(current) && installment) {
                    const currentInstallments = cache.charges
                        .filter(
                            (charge) =>
                                charge.installment_parent_id === id,
                        )
                        .sort(
                            (left, right) =>
                                (left.installment_number ?? 0) -
                                (right.installment_number ?? 0),
                        )
                    const hasPayments =
                        current.paid > 0 ||
                        currentInstallments.some(
                            (charge) => charge.paid > 0,
                        )
                    const currentFirstDate =
                        currentInstallments[0]?.scheduled_for
                            .toISOString()
                            .slice(0, 10)
                    if (
                        hasPayments &&
                        (amount !== current.amount ||
                            installment.count !==
                                current.installment_count ||
                            installment.firstInstallmentDate !==
                                currentFirstDate)
                    ) {
                        toast.error(
                            'Después de registrar pagos solo puedes cambiar el nombre o la categoría.',
                        )
                        return false
                    }

                    const installmentIds = Array.from(
                        { length: installment.count },
                        (_, index) =>
                            currentInstallments[index]?.id ??
                            crypto.randomUUID(),
                    )
                    mutation = {
                        mutationId,
                        type: 'installment.update',
                        occurredAt,
                        dependsOn,
                        baseRevision: current.revision,
                        plan: {
                            id,
                            name: trimmedName,
                            amount,
                            categoryId,
                            categoryName: normalizedCategory,
                            ...installment,
                            installmentIds,
                        },
                    }
                } else {
                    mutation = {
                        mutationId,
                        type: 'charge.update',
                        occurredAt,
                        dependsOn,
                        chargeId: id,
                        baseRevision: current.revision,
                        name: trimmedName,
                        amount,
                        categoryId,
                        categoryName: normalizedCategory,
                    }
                }
                const visible = materializeMutation(cache, mutation)
                await saveOptimisticCardMutation(
                    serializeCache(visible),
                    mutation,
                )
                const pending = await listPendingCardMutations(userId, cardId)
                if (isActiveCard(get(), userId, cardId)) {
                    set({
                        charges: visible.charges,
                        categories: visible.categories,
                        summary: visible.summary,
                        pendingMutationCount: pending.length,
                        syncStatus:
                            typeof navigator !== 'undefined' &&
                            navigator.onLine === false
                                ? 'offline'
                                : get().syncStatus,
                    })
                }
                syncAfterMutation(userId, cardId)
                return true
            })
        } catch {
            toast.error(
                'No se pudo guardar el cambio localmente. Inténtalo de nuevo.',
            )
            return false
        }
    },

    deleteCharge: async (id) => {
        const state = get()
        if (state.cardAccess !== 'owner' && state.cardAccess !== 'write') {
            return false
        }
        if (!state.activeCardId || !state.activeUserId) return false
        const current = state.charges.find((charge) => charge.id === id)
        if (!current) return false
        if (isInstallmentCharge(current)) {
            toast.error('Elimina el cargo principal de este plan.')
            return false
        }
        if (
            isInstallmentParentCharge(current) &&
            (current.paid > 0 ||
                state.charges.some(
                    (charge) =>
                        charge.installment_parent_id === current.id &&
                        charge.paid > 0,
                ))
        ) {
            toast.error(
                'No puedes eliminar un plan que ya tiene pagos registrados.',
            )
            return false
        }

        const userId = state.activeUserId
        const cardId = state.activeCardId
        const key = getCardCacheKey(userId, cardId)
        try {
            return await serializeCardEnqueue(key, async () => {
                const latestPending =
                    await findLatestPendingMutationForCharge(
                        userId,
                        cardId,
                        id,
                    )
                const latestState = get()
                let cache = isActiveCard(latestState, userId, cardId)
                    ? (activeCache(latestState) ?? emptyCache(userId, cardId))
                    : null
                if (!cache) {
                    const stored = await readCardCache(userId, cardId)
                    cache = stored
                        ? (deserializeCache(stored) ??
                          emptyCache(userId, cardId))
                        : emptyCache(userId, cardId)
                }
                const mutation:
                    | ChargeDeleteMutation
                    | InstallmentDeleteMutation =
                    isInstallmentParentCharge(current)
                        ? {
                              mutationId: crypto.randomUUID(),
                              type: 'installment.delete',
                              occurredAt: new Date().toISOString(),
                              dependsOn: latestPending
                                  ? [latestPending.mutationId]
                                  : undefined,
                              parentId: id,
                              baseRevision: current.revision,
                          }
                        : {
                              mutationId: crypto.randomUUID(),
                              type: 'charge.delete',
                              occurredAt: new Date().toISOString(),
                              dependsOn: latestPending
                                  ? [latestPending.mutationId]
                                  : undefined,
                              chargeId: id,
                              baseRevision: current.revision,
                          }
                const visible = materializeMutation(cache, mutation)
                await saveOptimisticCardMutation(
                    serializeCache(visible),
                    mutation,
                )
                const pending = await listPendingCardMutations(userId, cardId)
                if (isActiveCard(get(), userId, cardId)) {
                    set({
                        charges: visible.charges,
                        categories: visible.categories,
                        summary: visible.summary,
                        pendingMutationCount: pending.length,
                        syncStatus:
                            typeof navigator !== 'undefined' &&
                            navigator.onLine === false
                                ? 'offline'
                                : get().syncStatus,
                    })
                }
                syncAfterMutation(userId, cardId)
                return true
            })
        } catch {
            toast.error(
                'No se pudo guardar el cambio localmente. Inténtalo de nuevo.',
            )
            return false
        }
    },

    acceptServerConflict: async (mutationId) => {
        const state = get()
        if (!state.activeUserId || !state.activeCardId) return
        const conflict = state.syncConflicts.find(
            (item) => item.mutationId === mutationId,
        )
        const userId = state.activeUserId
        const cardId = state.activeCardId
        await resolveCardMutationConflict(userId, cardId, mutationId)
        const conflicts = await listCardMutationConflicts(userId, cardId)

        if (isActiveCard(get(), userId, cardId)) {
            const cache = activeCache(get())
            if (cache) {
                let invalidated: RuntimeCardCache = {
                    ...cache,
                    cursor: null,
                }
                if (conflict?.result.status === 'conflict') {
                    invalidated = applyMutationResults(invalidated, [
                        conflict.result,
                    ])
                } else if (
                    conflict?.result.status === 'gone' ||
                    (conflict?.result.status === 'rejected' &&
                        (conflict.mutation.type === 'charge.create' ||
                            conflict.mutation.type ===
                                'installment.create'))
                ) {
                    const affectedIds = new Set(
                        mutationChargeIds(conflict.mutation),
                    )
                    const charges = invalidated.charges.filter(
                        (charge) => !affectedIds.has(charge.id),
                    )
                    invalidated = {
                        ...invalidated,
                        charges,
                        summary: rebuildChargeTotals(
                            charges,
                            invalidated.summary,
                        ),
                    }
                }
                await writeCardCache(serializeCache(invalidated))
                set({
                    charges: invalidated.charges,
                    categories: invalidated.categories,
                    summary: invalidated.summary,
                    syncCursor: null,
                    syncConflicts: conflicts,
                })
            } else {
                set({ syncConflicts: conflicts })
            }
        }
        const key = getCardCacheKey(userId, cardId)
        if (syncRequests.has(key)) syncReruns.add(key)
        await get().syncCard(cardId, userId)
    },

    retryConflict: async (mutationId) => {
        const state = get()
        if (!state.activeUserId || !state.activeCardId) return
        if (state.cardAccess !== 'owner' && state.cardAccess !== 'write') return
        const conflict = state.syncConflicts.find(
            (item) => item.mutationId === mutationId,
        )
        if (!conflict) return

        const userId = state.activeUserId
        const cardId = state.activeCardId
        const key = getCardCacheKey(userId, cardId)
        try {
            await serializeCardEnqueue(key, async () => {
                const currentState = get()
                let cache = isActiveCard(currentState, userId, cardId)
                    ? (activeCache(currentState) ?? emptyCache(userId, cardId))
                    : null
                if (!cache) {
                    const stored = await readCardCache(userId, cardId)
                    cache = stored
                        ? (deserializeCache(stored) ??
                          emptyCache(userId, cardId))
                        : emptyCache(userId, cardId)
                }

                const original = conflict.mutation
                const chargeId = mutationChargeId(original)
                const serverCharge =
                    conflict.result.status === 'conflict'
                        ? deserializeCharge(conflict.result.serverCharge)
                        : cache.charges.find((charge) => charge.id === chargeId)
                const latestPending =
                    await findLatestPendingMutationForCharge(
                        userId,
                        cardId,
                        chargeId,
                    )
                const dependsOn = latestPending
                    ? [latestPending.mutationId]
                    : undefined
                let retry: ClientMutation | null = null

                if (original.type === 'charge.create') {
                    retry = {
                        ...original,
                        mutationId: crypto.randomUUID(),
                        occurredAt: new Date().toISOString(),
                        dependsOn: undefined,
                        charge: {
                            ...original.charge,
                            id: crypto.randomUUID(),
                        },
                    }
                } else if (original.type === 'installment.create') {
                    retry = {
                        ...original,
                        mutationId: crypto.randomUUID(),
                        occurredAt: new Date().toISOString(),
                        dependsOn: undefined,
                        plan: {
                            ...original.plan,
                            id: crypto.randomUUID(),
                            installmentIds: original.plan.installmentIds.map(
                                () => crypto.randomUUID(),
                            ),
                        },
                    }
                } else if (original.type === 'charge.update') {
                    if (serverCharge) {
                        retry = {
                            ...original,
                            mutationId: crypto.randomUUID(),
                            occurredAt: new Date().toISOString(),
                            dependsOn,
                            baseRevision: serverCharge.revision,
                        }
                    } else {
                        retry = {
                            mutationId: crypto.randomUUID(),
                            type: 'charge.create',
                            occurredAt: new Date().toISOString(),
                            charge: {
                                id: crypto.randomUUID(),
                                name: original.name,
                                amount: original.amount,
                                categoryId: original.categoryId,
                                categoryName: original.categoryName,
                            },
                        }
                    }
                } else if (original.type === 'installment.update') {
                    if (serverCharge) {
                        retry = {
                            ...original,
                            mutationId: crypto.randomUUID(),
                            occurredAt: new Date().toISOString(),
                            dependsOn,
                            baseRevision: serverCharge.revision,
                        }
                    } else {
                        retry = {
                            mutationId: crypto.randomUUID(),
                            type: 'installment.create',
                            occurredAt: new Date().toISOString(),
                            plan: {
                                ...original.plan,
                                id: crypto.randomUUID(),
                                installmentIds:
                                    original.plan.installmentIds.map(
                                        () => crypto.randomUUID(),
                                    ),
                            },
                        }
                    }
                } else if (serverCharge) {
                    retry = {
                        ...original,
                        mutationId: crypto.randomUUID(),
                        occurredAt: new Date().toISOString(),
                        dependsOn,
                        baseRevision: serverCharge.revision,
                    }
                }

                if (retry) {
                    const visible = materializeMutation(cache, retry)
                    await replaceCardMutationConflict(
                        serializeCache(visible),
                        mutationId,
                        retry,
                    )
                    cache = visible
                } else {
                    await resolveCardMutationConflict(
                        userId,
                        cardId,
                        mutationId,
                    )
                }
                const [pending, conflicts] = await Promise.all([
                    listPendingCardMutations(userId, cardId),
                    listCardMutationConflicts(userId, cardId),
                ])
                if (isActiveCard(get(), userId, cardId)) {
                    set({
                        charges: cache.charges,
                        categories: cache.categories,
                        summary: cache.summary,
                        pendingMutationCount: pending.length,
                        syncConflicts: conflicts,
                    })
                }
                syncAfterMutation(userId, cardId)
            })
        } catch {
            toast.error('No se pudo volver a guardar el cambio local.')
        }
    },

    paidCharge: async (id) => {
        const state = get()
        if (state.cardAccess !== 'owner' && state.cardAccess !== 'write') return
        if (!state.activeCardId || !state.activeUserId) return
        const userId = state.activeUserId
        const cardId = state.activeCardId

        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            toast.error('Conéctate para registrar pagos.')
            return
        }
        await get().syncCard(cardId, userId)
        const pending = await listPendingCardMutations(userId, cardId)
        const latest = get()
        if (
            pending.some(
                (record) =>
                    mutationChargeIds(record.mutation).includes(id),
            ) ||
            (isActiveCard(latest, userId, cardId) &&
                latest.syncConflicts.some(
                    (conflict) =>
                        mutationChargeIds(conflict.mutation).includes(
                            id,
                        ),
                )) ||
            (isActiveCard(latest, userId, cardId) &&
                (latest.syncStatus === 'offline' ||
                    latest.syncStatus === 'error' ||
                    latest.syncStatus === 'unauthorized'))
        ) {
            toast.error(
                'Sincroniza los cambios pendientes de este cargo antes de pagarlo.',
            )
            return
        }

        const result = await paidChargeAction(id).catch(() => null)
        if (!result || !('data' in result) || !result.data) {
            toast.error('No se pudo registrar el pago.')
            return
        }
        if (!isActiveCard(get(), userId, cardId)) {
            syncAfterMutation(userId, cardId)
            return
        }

        const related = new Map(
            result.relatedCharges.map((charge) => [charge.id, charge]),
        )
        const charges = get().charges.map((charge) => {
            const updated = related.get(charge.id)
            return updated
                ? {
                      ...charge,
                      ...updated,
                      category:
                          'category' in updated
                              ? updated.category
                              : charge.category,
                  }
                : charge
        })
        set({ charges })
        await persistActiveCache(get())
        syncAfterMutation(userId, cardId)
    },

    batchPayCharges: async (amount) => {
        const state = get()
        if (state.cardAccess !== 'owner' && state.cardAccess !== 'write') {
            return null
        }
        if (
            !state.activeCardId ||
            !state.activeUserId ||
            !Number.isSafeInteger(amount) ||
            amount <= 0
        ) {
            return null
        }
        const userId = state.activeUserId
        const cardId = state.activeCardId

        return await serializeCardEnqueue(
            `payment:${userId}:${cardId}`,
            async () => {
                if (
                    typeof navigator !== 'undefined' &&
                    navigator.onLine === false
                ) {
                    toast.error('Conéctate para registrar pagos.')
                    return null
                }
                await get().syncCard(cardId, userId)
                const pending = await listPendingCardMutations(userId, cardId)
                const latest = get()
                if (
                    pending.length > 0 ||
                    (isActiveCard(latest, userId, cardId) &&
                        latest.syncConflicts.length > 0) ||
                    (isActiveCard(latest, userId, cardId) &&
                        (latest.syncStatus === 'offline' ||
                            latest.syncStatus === 'error' ||
                            latest.syncStatus === 'unauthorized'))
                ) {
                    toast.error(
                        'Sincroniza todos los cargos pendientes antes de aplicar un pago.',
                    )
                    return null
                }

                const request = getOrCreateBatchPaymentRequest(
                    userId,
                    cardId,
                    amount,
                )
                const recoveredPreviousRequest =
                    request.amount !== amount ||
                    request.asOfDate !== localDateOnly()
                const result = await batchPayChargesAction(
                    cardId,
                    request.amount,
                    request.requestId,
                    request.asOfDate,
                ).catch(() => null)
                if (!result || !('data' in result) || !result.data) {
                    if (result) {
                        clearBatchPaymentRequest(
                            userId,
                            cardId,
                            request.requestId,
                        )
                    }
                    toast.error('No se pudo aplicar el pago.')
                    return null
                }
                clearBatchPaymentRequest(
                    userId,
                    cardId,
                    request.requestId,
                )
                const outcome = {
                    appliedAmount: result.appliedAmount,
                    unappliedAmount: result.unappliedAmount,
                }
                if (recoveredPreviousRequest) {
                    toast.info(
                        'Se recuperó primero el pago anterior cuya respuesta estaba pendiente. Revisa el saldo antes de registrar otro.',
                    )
                }
                if (!isActiveCard(get(), userId, cardId)) {
                    syncAfterMutation(userId, cardId)
                    return outcome
                }

                const updated = new Map(
                    result.data.map((charge) => [charge.id, charge]),
                )
                const charges = get().charges.map(
                    (charge) => updated.get(charge.id) ?? charge,
                )
                set({ charges })
                await persistActiveCache(get())
                syncAfterMutation(userId, cardId)
                return outcome
            },
        )
    },

    createCategory: async (name, monthlyBudget) => {
        const state = get()
        if (state.cardAccess !== 'owner' && state.cardAccess !== 'write') return
        if (!state.activeCardId || !state.activeUserId) return
        const userId = state.activeUserId
        const cardId = state.activeCardId
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            toast.error('La administración de categorías requiere conexión.')
            return
        }
        await get().syncCard(cardId, userId)
        const pending = await listPendingCardMutations(userId, cardId)
        const latest = get()
        if (
            !isActiveCard(latest, userId, cardId) ||
            pending.length > 0 ||
            latest.syncConflicts.length > 0 ||
            latest.syncStatus === 'offline' ||
            latest.syncStatus === 'error' ||
            latest.syncStatus === 'unauthorized' ||
            (latest.cardAccess !== 'owner' && latest.cardAccess !== 'write')
        ) {
            toast.error(
                'Sincroniza los cargos pendientes antes de administrar categorías.',
            )
            return
        }

        const result = await createChargeCategoryAction({
            card_id: cardId,
            name,
            monthly_budget: monthlyBudget,
        }).catch(() => null)
        if (!isActiveCard(get(), state.activeUserId, state.activeCardId)) {
            syncAfterMutation(state.activeUserId, state.activeCardId)
            return
        }
        if (!result?.data) {
            toast.error('No se pudo crear la categoría.')
            return
        }

        const categories = [
            result.data,
            ...get().categories.filter(
                (category) => category.id !== result.data?.id,
            ),
        ].sort((a, b) => a.name.localeCompare(b.name))
        set({ categories })
        await persistActiveCache(get())
        syncAfterMutation(state.activeUserId, state.activeCardId)
    },

    updateCategory: async (id, name, monthlyBudget) => {
        const state = get()
        if (state.cardAccess !== 'owner' && state.cardAccess !== 'write') return
        if (!state.activeCardId || !state.activeUserId) return
        const userId = state.activeUserId
        const cardId = state.activeCardId
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            toast.error('La administración de categorías requiere conexión.')
            return
        }
        await get().syncCard(cardId, userId)
        const pending = await listPendingCardMutations(userId, cardId)
        const latest = get()
        if (
            !isActiveCard(latest, userId, cardId) ||
            pending.length > 0 ||
            latest.syncConflicts.length > 0 ||
            latest.syncStatus === 'offline' ||
            latest.syncStatus === 'error' ||
            latest.syncStatus === 'unauthorized' ||
            (latest.cardAccess !== 'owner' && latest.cardAccess !== 'write')
        ) {
            toast.error(
                'Sincroniza los cargos pendientes antes de administrar categorías.',
            )
            return
        }

        const result = await updateChargeCategoryAction(id, {
            name,
            monthly_budget: monthlyBudget,
        }).catch(() => null)
        if (!isActiveCard(get(), state.activeUserId, state.activeCardId)) {
            syncAfterMutation(state.activeUserId, state.activeCardId)
            return
        }
        if (!result?.data) {
            toast.error('No se pudo actualizar la categoría.')
            return
        }

        const affectedCharges = new Set(result.affectedChargeIds)
        const categories = get()
            .categories.map((category) =>
                category.id === id ? result.data : category,
            )
            .sort((a, b) => a.name.localeCompare(b.name))
        const charges = get().charges.map((charge) =>
            charge.category?.id === id
                ? {
                      ...charge,
                      category: result.data,
                      revision: affectedCharges.has(charge.id)
                          ? result.revision
                          : charge.revision,
                  }
                : charge,
        )
        set({ categories, charges })
        await persistActiveCache(get())
        syncAfterMutation(state.activeUserId, state.activeCardId)
    },

    deleteCategory: async (id) => {
        const state = get()
        if (state.cardAccess !== 'owner' && state.cardAccess !== 'write') return
        if (!state.activeCardId || !state.activeUserId) return
        const userId = state.activeUserId
        const cardId = state.activeCardId
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            toast.error('La administración de categorías requiere conexión.')
            return
        }
        await get().syncCard(cardId, userId)
        const pending = await listPendingCardMutations(userId, cardId)
        const latest = get()
        if (
            !isActiveCard(latest, userId, cardId) ||
            pending.length > 0 ||
            latest.syncConflicts.length > 0 ||
            latest.syncStatus === 'offline' ||
            latest.syncStatus === 'error' ||
            latest.syncStatus === 'unauthorized' ||
            (latest.cardAccess !== 'owner' && latest.cardAccess !== 'write')
        ) {
            toast.error(
                'Sincroniza los cargos pendientes antes de administrar categorías.',
            )
            return
        }

        const result = await deleteChargeCategoryAction(id).catch(() => null)
        if (!isActiveCard(get(), state.activeUserId, state.activeCardId)) {
            syncAfterMutation(state.activeUserId, state.activeCardId)
            return
        }
        if (!result?.data) {
            toast.error('No se pudo eliminar la categoría.')
            return
        }

        const affectedCharges = new Set(result.affectedChargeIds)
        const categories = get().categories.filter(
            (category) => category.id !== id,
        )
        const charges = get().charges.map((charge) =>
            charge.category?.id === id
                ? {
                      ...charge,
                      category: null,
                      category_id: null,
                      revision: affectedCharges.has(charge.id)
                          ? result.revision
                          : charge.revision,
                  }
                : charge,
        )
        set({ categories, charges })
        await persistActiveCache(get())
        syncAfterMutation(state.activeUserId, state.activeCardId)
    },

    setPageSize: (size) => {
        set({ pageSize: size })
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('pagora-page-size', String(size))
        }
    },
}))
