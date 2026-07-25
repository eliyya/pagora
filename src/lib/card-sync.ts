import 'server-only'

import { db } from '@/db/prisma'
import type {
    Charge,
    ChargeCategory,
    Prisma,
} from '@/db/generated/prisma/client'
import { getCardAccess } from '@/lib/card-access'
import { isAccountingCharge } from '@/lib/installments'
import type {
    CardSyncPayload,
    CardSyncAccess,
    DailySummary,
    SerializedCharge,
    SerializedChargeCategory,
} from '@/lib/card-sync.types'

type ChargeWithCategory = Charge & {
    category: ChargeCategory | null
}

type CardSyncResult =
    | { status: 'not-found' }
    | { status: 'unchanged'; cursor: number; access: CardSyncAccess }
    | { status: 'ok'; data: CardSyncPayload }

function serializeCategory(
    category: ChargeCategory,
): SerializedChargeCategory {
    return {
        ...category,
        created_at: category.created_at.toISOString(),
        updated_at: category.updated_at.toISOString(),
    }
}

export function serializeCharge(
    charge: ChargeWithCategory,
): SerializedCharge {
    return {
        id: charge.id,
        name: charge.name,
        card_id: charge.card_id,
        category_id: charge.category_id,
        kind: charge.kind,
        installment_parent_id: charge.installment_parent_id,
        installment_number: charge.installment_number,
        installment_count: charge.installment_count,
        amount: charge.amount,
        paid: charge.paid,
        revision: charge.revision,
        scheduled_for: charge.scheduled_for.toISOString().slice(0, 10),
        created_at: charge.created_at.toISOString(),
        updated_at: charge.updated_at.toISOString(),
        category: charge.category
            ? serializeCategory(charge.category)
            : null,
    }
}

async function buildDailySummary(
    tx: Prisma.TransactionClient,
    cardId: string,
    charges: ChargeWithCategory[],
): Promise<DailySummary[]> {
    const values = new Map<
        string,
        { payments: number; charges: number }
    >()

    for (const charge of charges) {
        if (!isAccountingCharge(charge)) continue
        const date = charge.scheduled_for.toISOString().slice(0, 10)
        const entry = values.get(date) ?? { payments: 0, charges: 0 }
        entry.charges += charge.amount / 100
        values.set(date, entry)
    }

    const payments = await tx.paymentLog.findMany({
        where: {
            status: 'success',
            charge: { card_id: cardId },
        },
        select: {
            amount: true,
            created_at: true,
        },
    })

    for (const payment of payments) {
        const date = payment.created_at.toISOString().slice(0, 10)
        const entry = values.get(date) ?? { payments: 0, charges: 0 }
        entry.payments += payment.amount / 100
        values.set(date, entry)
    }

    return Array.from(values, ([date, value]) => ({
        date,
        ...value,
    })).sort((a, b) => a.date.localeCompare(b.date))
}

async function readSnapshot(
    tx: Prisma.TransactionClient,
    cardId: string,
    cursor: number,
    access: CardSyncAccess,
): Promise<CardSyncPayload> {
    const [charges, categories] = await Promise.all([
        tx.charge.findMany({
            where: { card_id: cardId },
            include: { category: true },
            orderBy: [
                { scheduled_for: 'desc' },
                { created_at: 'desc' },
            ],
        }),
        tx.chargeCategory.findMany({
            where: { card_id: cardId },
            orderBy: { name: 'asc' },
        }),
    ])

    return {
        mode: 'snapshot',
        access,
        cursor,
        charges: charges.map(serializeCharge),
        deletedChargeIds: [],
        categories: categories.map(serializeCategory),
        deletedCategoryIds: [],
        summary: await buildDailySummary(tx, cardId, charges),
    }
}

async function readDelta(
    tx: Prisma.TransactionClient,
    cardId: string,
    fromCursor: number,
    toCursor: number,
    access: CardSyncAccess,
): Promise<CardSyncPayload> {
    const changes = await tx.cardChange.findMany({
        where: {
            card_id: cardId,
            version: {
                gt: fromCursor,
                lte: toCursor,
            },
        },
        orderBy: [{ version: 'asc' }, { id: 'asc' }],
    })

    const latestChanges = new Map<string, (typeof changes)[number]>()
    for (const change of changes) {
        latestChanges.set(`${change.entity}:${change.entity_id}`, change)
    }

    const chargeChanges = Array.from(latestChanges.values()).filter(
        (change) => change.entity === 'charge',
    )
    const categoryChanges = Array.from(latestChanges.values()).filter(
        (change) => change.entity === 'category',
    )

    const chargeIds = chargeChanges
        .filter((change) => change.operation === 'upsert')
        .map((change) => change.entity_id)
    const categoryIds = categoryChanges
        .filter((change) => change.operation === 'upsert')
        .map((change) => change.entity_id)

    const [charges, categories] = await Promise.all([
        chargeIds.length === 0
            ? Promise.resolve([])
            : tx.charge.findMany({
                  where: {
                      card_id: cardId,
                      id: { in: chargeIds },
                  },
                  include: { category: true },
                  orderBy: [
                      { scheduled_for: 'desc' },
                      { created_at: 'desc' },
                  ],
              }),
        categoryIds.length === 0
            ? Promise.resolve([])
            : tx.chargeCategory.findMany({
                  where: {
                      card_id: cardId,
                      id: { in: categoryIds },
                  },
              }),
    ])

    const affectsSummary = changes.some(
        (change) =>
            change.entity === 'charge' || change.entity === 'payment',
    )
    let summary: DailySummary[] | null = null
    if (affectsSummary) {
        const currentCharges = await tx.charge.findMany({
            where: { card_id: cardId },
            include: { category: true },
        })
        summary = await buildDailySummary(tx, cardId, currentCharges)
    }

    return {
        mode: 'delta',
        access,
        cursor: toCursor,
        charges: charges.map(serializeCharge),
        deletedChargeIds: chargeChanges
            .filter((change) => change.operation === 'delete')
            .map((change) => change.entity_id),
        categories: categories.map(serializeCategory),
        deletedCategoryIds: categoryChanges
            .filter((change) => change.operation === 'delete')
            .map((change) => change.entity_id),
        summary,
    }
}

export async function getCardSync(
    cardId: string,
    userId: string,
    cursor: number | null,
): Promise<CardSyncResult> {
    return await db.$transaction(
        async (tx) => {
            const access = await getCardAccess(cardId, userId, tx)
            if (!access || access.access === 'none') {
                return { status: 'not-found' }
            }

            const currentCursor = access.card.sync_version
            if (cursor === currentCursor) {
                return {
                    status: 'unchanged',
                    cursor: currentCursor,
                    access: access.access,
                }
            }

            if (cursor === null || cursor < 0 || cursor > currentCursor) {
                return {
                    status: 'ok',
                    data: await readSnapshot(
                        tx,
                        cardId,
                        currentCursor,
                        access.access,
                    ),
                }
            }

            return {
                status: 'ok',
                data: await readDelta(
                    tx,
                    cardId,
                    cursor,
                    currentCursor,
                    access.access,
                ),
            }
        },
        {
            isolationLevel: 'RepeatableRead',
        },
    )
}
