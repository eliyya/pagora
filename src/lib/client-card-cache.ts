import 'client-only'

import type {
    ClientMutation,
    ClientMutationResult,
} from '@/lib/card-mutations.types'
import type {
    DailySummary,
    SerializedCharge,
    SerializedChargeCategory,
} from '@/lib/card-sync.types'
import { isDateOnly } from '@/lib/installments'
import type { Card, User } from '@/db/generated/prisma/browser'

const DATABASE_NAME = 'pagora-client'
const DATABASE_VERSION = 3
const CARD_CACHE_STORE = 'cardCaches'
const OUTBOX_STORE = 'mutationOutbox'
const CONFLICT_STORE = 'mutationConflicts'
const OFFLINE_SESSION_STORE = 'offlineSession'
const ACTIVE_OFFLINE_SESSION_KEY = 'active'
export const OFFLINE_SESSION_READY_EVENT = 'pagora:offline-session-ready'
const CARD_KEY_INDEX = 'byCardKey'
const USER_ID_INDEX = 'byUserId'
const MUTATION_ID_INDEX = 'byMutationId'

export type StoredCardCache = {
    key: string
    userId: string
    cardId: string
    cardAccess?: 'none' | 'read' | 'write' | 'owner'
    snapshotReady?: boolean
    cursor: number | null
    charges: SerializedCharge[]
    categories: SerializedChargeCategory[]
    summary: DailySummary[]
    updatedAt: number
}

export type StoredOutboxMutation = {
    sequence?: number
    mutationId: string
    cardKey: string
    userId: string
    cardId: string
    mutation: ClientMutation
    queuedAt: number
    attempts: number
    lastAttemptAt: number | null
    lastError: string | null
}

export type StoredMutationConflict = {
    mutationId: string
    cardKey: string
    userId: string
    cardId: string
    mutation: ClientMutation
    result: ClientMutationResult
    detectedAt: number
}

export type StoredOfflineCard = Card & {
    access: 'read' | 'write' | 'owner'
    sharedBy?: {
        id: string
        username: string
        email: string
    }
}

export type StoredOfflineSession = {
    key: typeof ACTIVE_OFFLINE_SESSION_KEY
    userId: string
    user: User
    cards: StoredOfflineCard[]
    activeCardId: string
    updatedAt: number
}

export function getCardCacheKey(userId: string, cardId: string) {
    return `${userId}:${cardId}`
}

function isValidDateString(value: unknown) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function isStoredCategory(value: unknown, cardId: string) {
    if (!value || typeof value !== 'object') return false
    const category = value as Partial<SerializedChargeCategory>
    return (
        typeof category.id === 'string' &&
        category.card_id === cardId &&
        typeof category.name === 'string' &&
        typeof category.monthly_budget === 'number' &&
        isValidDateString(category.created_at) &&
        isValidDateString(category.updated_at)
    )
}

export function isStoredCardCache(value: unknown): value is StoredCardCache {
    if (!value || typeof value !== 'object') return false
    const cache = value as Partial<StoredCardCache>
    const validAccess = new Set(['none', 'read', 'write', 'owner'])

    if (
        typeof cache.userId !== 'string' ||
        typeof cache.cardId !== 'string' ||
        cache.key !== getCardCacheKey(cache.userId, cache.cardId) ||
        (cache.cardAccess !== undefined &&
            !validAccess.has(cache.cardAccess)) ||
        (cache.snapshotReady !== undefined &&
            typeof cache.snapshotReady !== 'boolean') ||
        (cache.cursor !== null &&
            (typeof cache.cursor !== 'number' ||
                !Number.isSafeInteger(cache.cursor) ||
                cache.cursor < 0)) ||
        !Array.isArray(cache.charges) ||
        !Array.isArray(cache.categories) ||
        !Array.isArray(cache.summary) ||
        typeof cache.updatedAt !== 'number'
    ) {
        return false
    }

    return (
        cache.categories.every((category) =>
            isStoredCategory(category, cache.cardId!),
        ) &&
        cache.charges.every((value) => {
            if (!value || typeof value !== 'object') return false
            const charge = value as Partial<SerializedCharge>
            const kind = charge.kind ?? 'single'
            const validKind =
                kind === 'single' ||
                kind === 'installment_parent' ||
                kind === 'installment'
            const validInstallmentMetadata =
                charge.kind === undefined ||
                (kind === 'single'
                    ? charge.installment_parent_id === null &&
                      charge.installment_number === null &&
                      charge.installment_count === null
                    : kind === 'installment_parent'
                      ? charge.installment_parent_id === null &&
                        charge.installment_number === null &&
                        Number.isSafeInteger(charge.installment_count) &&
                        charge.installment_count! >= 2
                      : typeof charge.installment_parent_id === 'string' &&
                        Number.isSafeInteger(charge.installment_number) &&
                        charge.installment_number! >= 1 &&
                        Number.isSafeInteger(charge.installment_count) &&
                        charge.installment_count! >=
                            charge.installment_number!)
            return (
                typeof charge.id === 'string' &&
                charge.card_id === cache.cardId &&
                typeof charge.name === 'string' &&
                validKind &&
                validInstallmentMetadata &&
                (charge.scheduled_for === undefined ||
                    isDateOnly(charge.scheduled_for)) &&
                (charge.category_id === null ||
                    typeof charge.category_id === 'string') &&
                typeof charge.amount === 'number' &&
                typeof charge.paid === 'number' &&
                Number.isSafeInteger(charge.revision) &&
                charge.revision! >= 0 &&
                isValidDateString(charge.created_at) &&
                isValidDateString(charge.updated_at) &&
                (charge.category === null ||
                    (charge.category !== undefined &&
                        isStoredCategory(charge.category, cache.cardId!) &&
                        charge.category.id === charge.category_id))
            )
        }) &&
        cache.summary.every(
            (entry) =>
                typeof entry?.date === 'string' &&
                typeof entry.charges === 'number' &&
                typeof entry.payments === 'number',
        )
    )
}

export function hasCompleteCardSnapshot(
    value: unknown,
): value is StoredCardCache {
    if (!isStoredCardCache(value)) return false
    const ready =
        value.snapshotReady === true ||
        (value.snapshotReady === undefined && value.cursor !== null)
    return (
        ready &&
        value.cardAccess !== undefined &&
        value.cardAccess !== 'none'
    )
}

function addIndex(
    store: IDBObjectStore,
    name: string,
    keyPath: string,
    options?: IDBIndexParameters,
) {
    if (!store.indexNames.contains(name)) {
        store.createIndex(name, keyPath, options)
    }
}

function openDatabase() {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
        let blocked = false

        request.onupgradeneeded = () => {
            const database = request.result
            const transaction = request.transaction
            if (!transaction) return

            const cardCacheStore = database.objectStoreNames.contains(
                CARD_CACHE_STORE,
            )
                ? transaction.objectStore(CARD_CACHE_STORE)
                : database.createObjectStore(CARD_CACHE_STORE, {
                      keyPath: 'key',
                  })
            addIndex(cardCacheStore, USER_ID_INDEX, 'userId')

            const outboxStore = database.objectStoreNames.contains(
                OUTBOX_STORE,
            )
                ? transaction.objectStore(OUTBOX_STORE)
                : database.createObjectStore(OUTBOX_STORE, {
                      keyPath: 'sequence',
                      autoIncrement: true,
                  })
            addIndex(outboxStore, CARD_KEY_INDEX, 'cardKey')
            addIndex(outboxStore, USER_ID_INDEX, 'userId')
            addIndex(outboxStore, MUTATION_ID_INDEX, 'mutationId', {
                unique: true,
            })

            const conflictStore = database.objectStoreNames.contains(
                CONFLICT_STORE,
            )
                ? transaction.objectStore(CONFLICT_STORE)
                : database.createObjectStore(CONFLICT_STORE, {
                      keyPath: 'mutationId',
                  })
            addIndex(conflictStore, CARD_KEY_INDEX, 'cardKey')
            addIndex(conflictStore, USER_ID_INDEX, 'userId')

            if (!database.objectStoreNames.contains(OFFLINE_SESSION_STORE)) {
                database.createObjectStore(OFFLINE_SESSION_STORE, {
                    keyPath: 'key',
                })
            }
        }
        request.onsuccess = () => {
            const database = request.result
            if (blocked) {
                database.close()
                return
            }
            database.onversionchange = () => database.close()
            resolve(database)
        }
        request.onerror = () => reject(request.error)
        request.onblocked = () => {
            blocked = true
            reject(new Error('IndexedDB upgrade is blocked by another tab'))
        }
    })
}

function waitForTransaction(transaction: IDBTransaction) {
    return new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onabort = () =>
            reject(
                transaction.error ??
                    new Error('IndexedDB transaction was aborted'),
            )
        transaction.onerror = () =>
            reject(
                transaction.error ??
                    new Error('IndexedDB transaction failed'),
            )
    })
}

function getRequestResult<T>(request: IDBRequest<T>) {
    return new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

async function runCardCacheRequest<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
    const database = await openDatabase()

    try {
        const transaction = database.transaction(CARD_CACHE_STORE, mode)
        const completion = waitForTransaction(transaction)
        const result = await getRequestResult(
            operation(transaction.objectStore(CARD_CACHE_STORE)),
        )
        await completion
        return result
    } finally {
        database.close()
    }
}

function ensureCacheIdentity(cache: StoredCardCache) {
    if (
        cache.key !== getCardCacheKey(cache.userId, cache.cardId) ||
        !cache.userId ||
        !cache.cardId
    ) {
        throw new Error('Invalid card cache identity')
    }
}

function isStoredOfflineSession(value: unknown): value is StoredOfflineSession {
    if (!value || typeof value !== 'object') return false
    const session = value as Partial<StoredOfflineSession>
    if (
        session.key !== ACTIVE_OFFLINE_SESSION_KEY ||
        !session.userId ||
        !session.user ||
        session.user.id !== session.userId ||
        !session.activeCardId ||
        !Array.isArray(session.cards) ||
        typeof session.updatedAt !== 'number'
    ) {
        return false
    }

    const validAccess = new Set(['read', 'write', 'owner'])
    return (
        session.cards.some((card) => card.id === session.activeCardId) &&
        session.cards.every(
            (card) =>
                typeof card.id === 'string' &&
                typeof card.name === 'string' &&
                validAccess.has(card.access),
        )
    )
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

function isOutboxRecordForCard(
    record: StoredOutboxMutation,
    userId: string,
    cardId: string,
) {
    return (
        record.userId === userId &&
        record.cardId === cardId &&
        record.cardKey === getCardCacheKey(userId, cardId) &&
        record.mutationId === record.mutation.mutationId
    )
}

function deleteRecordsFromIndex(
    store: IDBObjectStore,
    indexName: string,
    value: IDBValidKey,
) {
    const request = store.index(indexName).openKeyCursor(IDBKeyRange.only(value))
    request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        store.delete(cursor.primaryKey)
        cursor.continue()
    }
}

export async function readCardCache(userId: string, cardId: string) {
    if (typeof indexedDB === 'undefined') return null

    try {
        const result = await runCardCacheRequest<StoredCardCache | undefined>(
            'readonly',
            (store) => store.get(getCardCacheKey(userId, cardId)),
        )
        return result ?? null
    } catch {
        return null
    }
}

export async function readOfflineSession() {
    if (typeof indexedDB === 'undefined') return null

    let database: IDBDatabase | null = null
    try {
        database = await openDatabase()
        const transaction = database.transaction(
            OFFLINE_SESSION_STORE,
            'readonly',
        )
        const completion = waitForTransaction(transaction)
        const value = await getRequestResult(
            transaction
                .objectStore(OFFLINE_SESSION_STORE)
                .get(ACTIVE_OFFLINE_SESSION_KEY),
        )
        await completion
        return isStoredOfflineSession(value) ? value : null
    } catch {
        return null
    } finally {
        database?.close()
    }
}

export async function readOfflineReadySession() {
    if (typeof indexedDB === 'undefined') return null

    let database: IDBDatabase | null = null
    try {
        database = await openDatabase()
        const transaction = database.transaction(
            [OFFLINE_SESSION_STORE, CARD_CACHE_STORE],
            'readonly',
        )
        const completion = waitForTransaction(transaction)
        const sessionStore = transaction.objectStore(OFFLINE_SESSION_STORE)
        const cacheStore = transaction.objectStore(CARD_CACHE_STORE)
        const sessionRequest = sessionStore.get(ACTIVE_OFFLINE_SESSION_KEY)
        let readySession: StoredOfflineSession | null = null

        sessionRequest.onsuccess = () => {
            const session = sessionRequest.result
            if (!isStoredOfflineSession(session)) return

            const cacheRequest = cacheStore.get(
                getCardCacheKey(session.userId, session.activeCardId),
            )
            cacheRequest.onsuccess = () => {
                if (hasCompleteCardSnapshot(cacheRequest.result)) {
                    readySession = session
                }
            }
        }

        await completion
        return readySession
    } catch {
        return null
    } finally {
        database?.close()
    }
}

export async function saveOfflineReadyCard(
    cache: StoredCardCache,
    session: Omit<StoredOfflineSession, 'key' | 'updatedAt'>,
) {
    if (typeof indexedDB === 'undefined') {
        throw new Error('IndexedDB is unavailable')
    }

    ensureCacheIdentity(cache)
    if (!hasCompleteCardSnapshot(cache)) {
        throw new Error('A complete card snapshot is required')
    }

    const value: StoredOfflineSession = {
        ...session,
        key: ACTIVE_OFFLINE_SESSION_KEY,
        updatedAt: Date.now(),
    }
    if (!isStoredOfflineSession(value)) {
        throw new Error('Invalid offline session')
    }
    if (
        cache.userId !== value.userId ||
        cache.cardId !== value.activeCardId
    ) {
        throw new Error('Offline session does not match the card snapshot')
    }

    const database = await openDatabase()
    try {
        const transaction = database.transaction(
            [CARD_CACHE_STORE, OFFLINE_SESSION_STORE],
            'readwrite',
        )
        const completion = waitForTransaction(transaction)
        transaction.objectStore(CARD_CACHE_STORE).put({
            ...cache,
            snapshotReady: true,
        })
        transaction.objectStore(OFFLINE_SESSION_STORE).put(value)
        await completion
        if (typeof window !== 'undefined') {
            window.dispatchEvent(
                new CustomEvent(OFFLINE_SESSION_READY_EVENT),
            )
        }
    } finally {
        database.close()
    }
}

export async function clearOfflineSession(userId: string) {
    if (typeof indexedDB === 'undefined' || !userId) return

    const database = await openDatabase()
    try {
        const transaction = database.transaction(
            OFFLINE_SESSION_STORE,
            'readwrite',
        )
        const completion = waitForTransaction(transaction)
        const store = transaction.objectStore(OFFLINE_SESSION_STORE)
        const request = store.get(ACTIVE_OFFLINE_SESSION_KEY)
        request.onsuccess = () => {
            const session = request.result as StoredOfflineSession | undefined
            if (session?.userId === userId) {
                store.delete(ACTIVE_OFFLINE_SESSION_KEY)
            }
        }
        await completion
    } finally {
        database.close()
    }
}

export async function clearUserOfflineView(userId: string) {
    if (typeof indexedDB === 'undefined' || !userId) return

    const database = await openDatabase()
    try {
        // Pending commands and conflicts intentionally live in different
        // stores and survive this local privacy cleanup.
        const transaction = database.transaction(
            [CARD_CACHE_STORE, OFFLINE_SESSION_STORE],
            'readwrite',
        )
        const completion = waitForTransaction(transaction)
        deleteRecordsFromIndex(
            transaction.objectStore(CARD_CACHE_STORE),
            USER_ID_INDEX,
            userId,
        )

        const sessionStore = transaction.objectStore(OFFLINE_SESSION_STORE)
        const sessionRequest = sessionStore.get(ACTIVE_OFFLINE_SESSION_KEY)
        sessionRequest.onsuccess = () => {
            const session = sessionRequest.result as
                | StoredOfflineSession
                | undefined
            if (session?.userId === userId) {
                sessionStore.delete(ACTIVE_OFFLINE_SESSION_KEY)
            }
        }

        await completion
    } finally {
        database.close()
    }
}

export async function writeCardCache(cache: StoredCardCache) {
    if (typeof indexedDB === 'undefined') return

    try {
        ensureCacheIdentity(cache)
        await runCardCacheRequest<IDBValidKey>('readwrite', (store) =>
            store.put(cache),
        )
    } catch {
        // The in-memory state remains usable when storage is unavailable.
    }
}

export async function deleteCardCache(userId: string, cardId: string) {
    if (typeof indexedDB === 'undefined') return

    try {
        await runCardCacheRequest<undefined>('readwrite', (store) =>
            store.delete(getCardCacheKey(userId, cardId)),
        )
    } catch {
        // Access revocation still clears the visible in-memory state.
    }
}

export async function listPendingCardMutations(
    userId: string,
    cardId: string,
) {
    if (typeof indexedDB === 'undefined') return []

    let database: IDBDatabase | null = null
    try {
        database = await openDatabase()
        const transaction = database.transaction(OUTBOX_STORE, 'readonly')
        const completion = waitForTransaction(transaction)
        const request = transaction
            .objectStore(OUTBOX_STORE)
            .index(CARD_KEY_INDEX)
            .getAll(IDBKeyRange.only(getCardCacheKey(userId, cardId)))
        const records = (await getRequestResult(
            request,
        )) as StoredOutboxMutation[]
        await completion

        return records
            .filter((record) =>
                isOutboxRecordForCard(record, userId, cardId),
            )
            .sort(
                (left, right) =>
                    (left.sequence ?? Number.MAX_SAFE_INTEGER) -
                    (right.sequence ?? Number.MAX_SAFE_INTEGER),
            )
    } catch {
        return []
    } finally {
        database?.close()
    }
}

export async function findLatestPendingMutationForCharge(
    userId: string,
    cardId: string,
    chargeId: string,
) {
    const records = await listPendingCardMutations(userId, cardId)
    for (let index = records.length - 1; index >= 0; index -= 1) {
        if (mutationChargeIds(records[index].mutation).includes(chargeId)) {
            return records[index]
        }
    }
    return null
}

export async function saveOptimisticCardMutation(
    cache: StoredCardCache,
    mutation: ClientMutation,
) {
    if (typeof indexedDB === 'undefined') {
        throw new Error('IndexedDB is unavailable')
    }
    ensureCacheIdentity(cache)
    if (!mutation.mutationId) throw new Error('Mutation ID is required')

    const database = await openDatabase()
    const record: StoredOutboxMutation = {
        mutationId: mutation.mutationId,
        cardKey: cache.key,
        userId: cache.userId,
        cardId: cache.cardId,
        mutation,
        queuedAt: Date.now(),
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
    }

    try {
        const transaction = database.transaction(
            [CARD_CACHE_STORE, OUTBOX_STORE],
            'readwrite',
        )
        const completion = waitForTransaction(transaction)
        transaction.objectStore(CARD_CACHE_STORE).put(cache)
        const request = transaction.objectStore(OUTBOX_STORE).add(record)
        const sequence = await getRequestResult(request)
        await completion
        return { ...record, sequence: Number(sequence) }
    } finally {
        database.close()
    }
}

export async function replaceCardMutationConflict(
    cache: StoredCardCache,
    conflictMutationId: string,
    mutation: ClientMutation,
) {
    if (typeof indexedDB === 'undefined') {
        throw new Error('IndexedDB is unavailable')
    }
    ensureCacheIdentity(cache)
    if (!conflictMutationId || !mutation.mutationId) {
        throw new Error('Mutation IDs are required')
    }
    if (conflictMutationId === mutation.mutationId) {
        throw new Error('A retry requires a new mutation ID')
    }

    const database = await openDatabase()
    const record: StoredOutboxMutation = {
        mutationId: mutation.mutationId,
        cardKey: cache.key,
        userId: cache.userId,
        cardId: cache.cardId,
        mutation,
        queuedAt: Date.now(),
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
    }
    let sequence: number | undefined
    let validationError: Error | null = null

    try {
        const transaction = database.transaction(
            [CARD_CACHE_STORE, OUTBOX_STORE, CONFLICT_STORE],
            'readwrite',
        )
        const completion = waitForTransaction(transaction)
        const cacheStore = transaction.objectStore(CARD_CACHE_STORE)
        const outboxStore = transaction.objectStore(OUTBOX_STORE)
        const conflictStore = transaction.objectStore(CONFLICT_STORE)
        const conflictRequest = conflictStore.get(conflictMutationId)

        conflictRequest.onsuccess = () => {
            const conflict = conflictRequest.result as
                | StoredMutationConflict
                | undefined
            if (
                !conflict ||
                conflict.userId !== cache.userId ||
                conflict.cardId !== cache.cardId ||
                conflict.cardKey !== cache.key ||
                conflict.mutationId !== conflictMutationId ||
                conflict.mutation.mutationId !== conflictMutationId
            ) {
                validationError = new Error(
                    'Mutation conflict is missing or belongs to another card',
                )
                transaction.abort()
                return
            }

            cacheStore.put(cache)
            const outboxRequest = outboxStore.add(record)
            outboxRequest.onsuccess = () => {
                sequence = Number(outboxRequest.result)
            }
            conflictStore.delete(conflictMutationId)
        }

        try {
            await completion
        } catch (error) {
            throw validationError ?? error
        }
        if (sequence === undefined) {
            throw new Error('Mutation retry was not queued')
        }
        return { ...record, sequence }
    } finally {
        database.close()
    }
}

export async function markCardMutationsAttempted(
    userId: string,
    cardId: string,
    mutationIds: string[],
    error: string | null = null,
) {
    if (typeof indexedDB === 'undefined' || mutationIds.length === 0) return

    const database = await openDatabase()
    try {
        const transaction = database.transaction(OUTBOX_STORE, 'readwrite')
        const completion = waitForTransaction(transaction)
        const store = transaction.objectStore(OUTBOX_STORE)
        const mutationIndex = store.index(MUTATION_ID_INDEX)
        const attemptedAt = Date.now()

        for (const mutationId of new Set(mutationIds)) {
            const request = mutationIndex.get(mutationId)
            request.onsuccess = () => {
                const record = request.result as
                    | StoredOutboxMutation
                    | undefined
                if (!record || !isOutboxRecordForCard(record, userId, cardId)) {
                    return
                }
                store.put({
                    ...record,
                    attempts: record.attempts + 1,
                    lastAttemptAt: attemptedAt,
                    lastError: error,
                })
            }
        }

        await completion
    } finally {
        database.close()
    }
}

export async function acknowledgeCardMutations(
    userId: string,
    cardId: string,
    mutationIds: string[],
) {
    if (typeof indexedDB === 'undefined' || mutationIds.length === 0) return

    const database = await openDatabase()
    try {
        const transaction = database.transaction(OUTBOX_STORE, 'readwrite')
        const completion = waitForTransaction(transaction)
        const store = transaction.objectStore(OUTBOX_STORE)
        const mutationIndex = store.index(MUTATION_ID_INDEX)

        for (const mutationId of new Set(mutationIds)) {
            const request = mutationIndex.get(mutationId)
            request.onsuccess = () => {
                const record = request.result as
                    | StoredOutboxMutation
                    | undefined
                if (
                    record?.sequence !== undefined &&
                    isOutboxRecordForCard(record, userId, cardId)
                ) {
                    store.delete(record.sequence)
                }
            }
        }

        await completion
    } finally {
        database.close()
    }
}

export async function listCardMutationConflicts(
    userId: string,
    cardId: string,
) {
    if (typeof indexedDB === 'undefined') return []

    let database: IDBDatabase | null = null
    try {
        database = await openDatabase()
        const transaction = database.transaction(CONFLICT_STORE, 'readonly')
        const completion = waitForTransaction(transaction)
        const request = transaction
            .objectStore(CONFLICT_STORE)
            .index(CARD_KEY_INDEX)
            .getAll(IDBKeyRange.only(getCardCacheKey(userId, cardId)))
        const records = (await getRequestResult(
            request,
        )) as StoredMutationConflict[]
        await completion

        return records
            .filter(
                (record) =>
                    record.userId === userId &&
                    record.cardId === cardId &&
                    record.cardKey === getCardCacheKey(userId, cardId) &&
                    record.mutationId === record.mutation.mutationId,
            )
            .sort((left, right) => left.detectedAt - right.detectedAt)
    } catch {
        return []
    } finally {
        database?.close()
    }
}

export async function saveCardMutationConflict(
    userId: string,
    cardId: string,
    mutation: ClientMutation,
    result: ClientMutationResult,
) {
    if (typeof indexedDB === 'undefined') {
        throw new Error('IndexedDB is unavailable')
    }
    if (mutation.mutationId !== result.mutationId) {
        throw new Error('Mutation result does not match the queued mutation')
    }

    const database = await openDatabase()
    const conflict: StoredMutationConflict = {
        mutationId: mutation.mutationId,
        cardKey: getCardCacheKey(userId, cardId),
        userId,
        cardId,
        mutation,
        result,
        detectedAt: Date.now(),
    }

    try {
        const transaction = database.transaction(
            [OUTBOX_STORE, CONFLICT_STORE],
            'readwrite',
        )
        const completion = waitForTransaction(transaction)
        const outboxStore = transaction.objectStore(OUTBOX_STORE)
        const conflictStore = transaction.objectStore(CONFLICT_STORE)
        const keyRequest = outboxStore
            .index(MUTATION_ID_INDEX)
            .get(mutation.mutationId)
        keyRequest.onsuccess = () => {
            const record = keyRequest.result as
                | StoredOutboxMutation
                | undefined
            if (
                record?.sequence !== undefined &&
                isOutboxRecordForCard(record, userId, cardId)
            ) {
                outboxStore.delete(record.sequence)
            }
        }
        conflictStore.put(conflict)
        await completion
        return conflict
    } finally {
        database.close()
    }
}

export async function resolveCardMutationConflict(
    userId: string,
    cardId: string,
    mutationId: string,
) {
    if (typeof indexedDB === 'undefined') return

    const database = await openDatabase()
    try {
        const transaction = database.transaction(CONFLICT_STORE, 'readwrite')
        const completion = waitForTransaction(transaction)
        const store = transaction.objectStore(CONFLICT_STORE)
        const request = store.get(mutationId)
        request.onsuccess = () => {
            const conflict = request.result as
                | StoredMutationConflict
                | undefined
            if (
                conflict?.userId === userId &&
                conflict.cardId === cardId
            ) {
                store.delete(mutationId)
            }
        }
        await completion
    } finally {
        database.close()
    }
}

export async function clearCardClientData(userId: string, cardId: string) {
    if (typeof indexedDB === 'undefined') return

    const database = await openDatabase()
    try {
        const transaction = database.transaction(
            [CARD_CACHE_STORE, OUTBOX_STORE, CONFLICT_STORE],
            'readwrite',
        )
        const completion = waitForTransaction(transaction)
        transaction
            .objectStore(CARD_CACHE_STORE)
            .delete(getCardCacheKey(userId, cardId))

        const cardKey = getCardCacheKey(userId, cardId)
        deleteRecordsFromIndex(
            transaction.objectStore(OUTBOX_STORE),
            CARD_KEY_INDEX,
            cardKey,
        )
        deleteRecordsFromIndex(
            transaction.objectStore(CONFLICT_STORE),
            CARD_KEY_INDEX,
            cardKey,
        )
        await completion
    } finally {
        database.close()
    }
}

export async function clearUserCardCaches(userId: string) {
    if (typeof indexedDB === 'undefined') return

    let database: IDBDatabase | null = null
    try {
        // Logout removes server-derived card data, but durable pending commands
        // and conflicts remain user-scoped so the next login can recover them.
        database = await openDatabase()
        const transaction = database.transaction(CARD_CACHE_STORE, 'readwrite')
        const completion = waitForTransaction(transaction)
        deleteRecordsFromIndex(
            transaction.objectStore(CARD_CACHE_STORE),
            USER_ID_INDEX,
            userId,
        )

        await completion
    } catch {
        // Logout must continue even when browser storage is unavailable.
    } finally {
        database?.close()
    }
}
