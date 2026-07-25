import 'server-only'

import { createHash } from 'node:crypto'
import type {
    Charge,
    ChargeCategory,
    Prisma,
} from '@/db/generated/prisma/client'
import { db } from '@/db/prisma'
import { beginCardChange, recordCardChanges } from '@/lib/card-changes'
import { dateOnlyToUtc } from '@/lib/charge-creation'
import { isDateOnly } from '@/lib/installments'

type ChargeWithCategory = Charge & {
    category: ChargeCategory | null
}

export type AppliedChargePayment = {
    paymentId: string
    chargeId: string
    chargeName: string
    amount: number
    scheduledFor: Date
}

type PayChargeResult =
    | { status: 'not-found' }
    | { status: 'installment-parent' }
    | {
          status: 'ok'
          charge: ChargeWithCategory
          updatedCharges: ChargeWithCategory[]
          paymentAmount: number
      }

type BatchPaymentIdempotency = {
    requestId: string
    userId: string
}

type PayCardAmountOptions = {
    asOfDate?: string
    idempotency?: BatchPaymentIdempotency
}

type StoredBatchPayment = {
    kind: 'payment.batch'
    requestedAmount: number
    asOfDate: string
    remaining: number
    updatedChargeIds: string[]
    payments: Array<{
        paymentId: string
        chargeId: string
        chargeName: string
        amount: number
        scheduledFor: string
    }>
}

async function lockCard(tx: Prisma.TransactionClient, cardId: string) {
    const cards = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "cards"
        WHERE "id" = ${cardId}
        FOR UPDATE
    `
    return cards.length > 0
}

function todayUtcDateOnly() {
    const now = new Date()
    return [
        now.getUTCFullYear(),
        String(now.getUTCMonth() + 1).padStart(2, '0'),
        String(now.getUTCDate()).padStart(2, '0'),
    ].join('-')
}

function paymentRequestHash(requestedAmount: number, asOfDate: string) {
    return createHash('sha256')
        .update(`payment.batch:${requestedAmount}:${asOfDate}`)
        .digest('hex')
}

function parseStoredBatchPayment(
    value: Prisma.JsonValue,
): StoredBatchPayment | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null
    }

    const stored = value as Record<string, Prisma.JsonValue>
    if (
        stored.kind !== 'payment.batch' ||
        !Number.isSafeInteger(stored.requestedAmount) ||
        !isDateOnly(stored.asOfDate) ||
        !Number.isSafeInteger(stored.remaining) ||
        !Array.isArray(stored.updatedChargeIds) ||
        !stored.updatedChargeIds.every((id) => typeof id === 'string') ||
        !Array.isArray(stored.payments)
    ) {
        return null
    }

    const payments = stored.payments.map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            return null
        }
        const payment = entry as Record<string, Prisma.JsonValue>
        if (
            typeof payment.paymentId !== 'string' ||
            typeof payment.chargeId !== 'string' ||
            typeof payment.chargeName !== 'string' ||
            !Number.isSafeInteger(payment.amount) ||
            !isDateOnly(payment.scheduledFor)
        ) {
            return null
        }
        return {
            paymentId: payment.paymentId,
            chargeId: payment.chargeId,
            chargeName: payment.chargeName,
            amount: payment.amount as number,
            scheduledFor: payment.scheduledFor,
        }
    })
    if (payments.some((payment) => payment === null)) return null

    return {
        kind: 'payment.batch',
        requestedAmount: stored.requestedAmount as number,
        asOfDate: stored.asOfDate,
        remaining: stored.remaining as number,
        updatedChargeIds: stored.updatedChargeIds as string[],
        payments: payments as StoredBatchPayment['payments'],
    }
}

async function updateInstallmentParent(
    tx: Prisma.TransactionClient,
    cardId: string,
    parentId: string,
    revision: number,
) {
    const parent = await tx.charge.findFirst({
        where: {
            id: parentId,
            card_id: cardId,
            kind: 'installment_parent',
        },
        include: { category: true },
    })
    if (!parent) {
        throw new Error('installment parent not found')
    }
    const installments = await tx.charge.aggregate({
        where: {
            card_id: cardId,
            installment_parent_id: parentId,
            kind: 'installment',
        },
        _sum: { paid: true },
    })

    return await tx.charge.update({
        where: { id: parent.id },
        data: {
            paid: Math.min(parent.amount, installments._sum.paid ?? 0),
            revision,
        },
        include: { category: true },
    })
}

export async function payChargeFully(
    cardId: string,
    chargeId: string,
): Promise<PayChargeResult> {
    return await db.$transaction(async (tx) => {
        if (!(await lockCard(tx, cardId))) return { status: 'not-found' }

        const current = await tx.charge.findFirst({
            where: { id: chargeId, card_id: cardId },
            include: { category: true },
        })
        if (!current) return { status: 'not-found' }
        if (current.kind === 'installment_parent') {
            return { status: 'installment-parent' }
        }

        const paymentAmount = current.amount - current.paid
        if (paymentAmount <= 0) {
            return {
                status: 'ok',
                charge: current,
                updatedCharges: [current],
                paymentAmount: 0,
            }
        }

        const revision = await beginCardChange(cardId, tx)
        const paid = await tx.charge.update({
            where: { id: current.id },
            data: {
                paid: current.amount,
                revision,
            },
            include: { category: true },
        })
        const updatedCharges: ChargeWithCategory[] = [paid]

        if (
            current.kind === 'installment' &&
            current.installment_parent_id
        ) {
            updatedCharges.push(
                await updateInstallmentParent(
                    tx,
                    cardId,
                    current.installment_parent_id,
                    revision,
                ),
            )
        }

        const payment = await tx.paymentLog.create({
            data: {
                charge_id: current.id,
                amount: paymentAmount,
                status: 'success',
            },
        })
        await recordCardChanges(
            cardId,
            revision,
            [
                ...updatedCharges.map((charge) => ({
                    entity: 'charge' as const,
                    entityId: charge.id,
                    operation: 'upsert' as const,
                })),
                {
                    entity: 'payment',
                    entityId: payment.id,
                    operation: 'upsert',
                },
            ],
            tx,
        )

        return {
            status: 'ok',
            charge: paid,
            updatedCharges,
            paymentAmount,
        }
    })
}

export async function payCardAmount(
    cardId: string,
    requestedAmount: number,
    options: PayCardAmountOptions = {},
) {
    if (!Number.isSafeInteger(requestedAmount) || requestedAmount <= 0) {
        throw new RangeError('payment amount must be a positive integer')
    }
    const asOfDate = options.asOfDate ?? todayUtcDateOnly()
    if (!isDateOnly(asOfDate)) {
        throw new RangeError('payment date must use YYYY-MM-DD')
    }
    const idempotency = options.idempotency
    if (
        idempotency &&
        (!idempotency.requestId ||
            idempotency.requestId.length > 440 ||
            !idempotency.userId)
    ) {
        throw new RangeError('invalid payment request id')
    }

    return await db.$transaction(async (tx) => {
        if (!(await lockCard(tx, cardId))) {
            return {
                status: 'not-found' as const,
                updatedCharges: [] as ChargeWithCategory[],
                payments: [] as AppliedChargePayment[],
                remaining: requestedAmount,
            }
        }

        const mutationId = idempotency
            ? `payment.batch:${idempotency.requestId}`
            : null
        const requestHash = idempotency
            ? paymentRequestHash(requestedAmount, asOfDate)
            : null
        if (idempotency && mutationId && requestHash) {
            const existing = await tx.appliedMutation.findUnique({
                where: {
                    card_id_mutation_id: {
                        card_id: cardId,
                        mutation_id: mutationId,
                    },
                },
            })
            if (
                existing &&
                (existing.user_id !== idempotency.userId ||
                    existing.request_hash !== requestHash)
            ) {
                return {
                    status: 'idempotency-conflict' as const,
                    updatedCharges: [] as ChargeWithCategory[],
                    payments: [] as AppliedChargePayment[],
                    remaining: requestedAmount,
                }
            }
            if (existing) {
                const stored = parseStoredBatchPayment(existing.result)
                if (!stored) {
                    throw new Error('invalid stored payment result')
                }
                const updatedCharges = await tx.charge.findMany({
                    where: { id: { in: stored.updatedChargeIds }, card_id: cardId },
                    include: { category: true },
                })
                return {
                    status: 'ok' as const,
                    updatedCharges,
                    payments: stored.payments.map((payment) => ({
                        ...payment,
                        scheduledFor: dateOnlyToUtc(payment.scheduledFor),
                    })),
                    remaining: stored.remaining,
                }
            }
        }

        const charges = await tx.charge.findMany({
            where: {
                card_id: cardId,
                kind: { not: 'installment_parent' },
                scheduled_for: { lte: dateOnlyToUtc(asOfDate) },
            },
            include: { category: true },
            orderBy: [
                { scheduled_for: 'asc' },
                { created_at: 'asc' },
                { id: 'asc' },
            ],
        })

        const allocations: Array<{
            charge: ChargeWithCategory
            amount: number
        }> = []
        let remaining = requestedAmount
        for (const charge of charges) {
            if (remaining <= 0) break
            const owed = charge.amount - charge.paid
            if (owed <= 0) continue
            const amount = Math.min(owed, remaining)
            remaining -= amount
            allocations.push({ charge, amount })
        }

        if (allocations.length === 0) {
            if (idempotency && mutationId && requestHash) {
                const stored: StoredBatchPayment = {
                    kind: 'payment.batch',
                    requestedAmount,
                    asOfDate,
                    remaining,
                    updatedChargeIds: [],
                    payments: [],
                }
                await tx.appliedMutation.create({
                    data: {
                        card_id: cardId,
                        mutation_id: mutationId,
                        user_id: idempotency.userId,
                        request_hash: requestHash,
                        result: stored as unknown as Prisma.InputJsonValue,
                    },
                })
            }
            return {
                status: 'ok' as const,
                updatedCharges: [] as ChargeWithCategory[],
                payments: [] as AppliedChargePayment[],
                remaining,
            }
        }

        const revision = await beginCardChange(cardId, tx)
        const updatedCharges: ChargeWithCategory[] = []
        const payments: AppliedChargePayment[] = []
        const parentIds = new Set<string>()

        for (const { charge, amount } of allocations) {
            updatedCharges.push(
                await tx.charge.update({
                    where: { id: charge.id },
                    data: {
                        paid: charge.paid + amount,
                        revision,
                    },
                    include: { category: true },
                }),
            )
            const payment = await tx.paymentLog.create({
                data: {
                    charge_id: charge.id,
                    amount,
                    status: 'success',
                },
            })
            payments.push({
                paymentId: payment.id,
                chargeId: charge.id,
                chargeName: charge.name,
                amount,
                scheduledFor: charge.scheduled_for,
            })

            if (
                charge.kind === 'installment' &&
                charge.installment_parent_id
            ) {
                parentIds.add(charge.installment_parent_id)
            }
        }

        for (const parentId of parentIds) {
            updatedCharges.push(
                await updateInstallmentParent(
                    tx,
                    cardId,
                    parentId,
                    revision,
                ),
            )
        }

        await recordCardChanges(
            cardId,
            revision,
            [
                ...updatedCharges.map((charge) => ({
                    entity: 'charge' as const,
                    entityId: charge.id,
                    operation: 'upsert' as const,
                })),
                ...payments.map((payment) => ({
                    entity: 'payment' as const,
                    entityId: payment.paymentId,
                    operation: 'upsert' as const,
                })),
            ],
            tx,
        )

        if (idempotency && mutationId && requestHash) {
            const stored: StoredBatchPayment = {
                kind: 'payment.batch',
                requestedAmount,
                asOfDate,
                remaining,
                updatedChargeIds: updatedCharges.map((charge) => charge.id),
                payments: payments.map((payment) => ({
                    paymentId: payment.paymentId,
                    chargeId: payment.chargeId,
                    chargeName: payment.chargeName,
                    amount: payment.amount,
                    scheduledFor: payment.scheduledFor
                        .toISOString()
                        .slice(0, 10),
                })),
            }
            await tx.appliedMutation.create({
                data: {
                    card_id: cardId,
                    mutation_id: mutationId,
                    user_id: idempotency.userId,
                    request_hash: requestHash,
                    result: stored as unknown as Prisma.InputJsonValue,
                },
            })
        }

        return {
            status: 'ok' as const,
            updatedCharges,
            payments,
            remaining,
        }
    })
}
