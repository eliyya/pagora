import 'server-only'
import { Temporal } from 'temporal-polyfill'
import type { Prisma } from '@/db/generated/prisma/client'
import { db } from '@/db/prisma'
import { beginCardChange, recordCardChanges } from '@/lib/card-changes'
import { dateOnlyToUtc } from '@/lib/charge-creation'
import { dueSubscriptionDates } from '@/lib/subscriptions'

/** Caller must hold the card lock acquired by beginCardChange in this transaction. */
export async function generateDueSubscriptionCharges(
    tx: Prisma.TransactionClient,
    cardId: string,
    subscriptionId: string,
    revision: number,
    now = Temporal.Now.instant(),
) {
    // Re-read after taking the card lock: concurrent invocations see the advanced cursor.
    const subscription = await tx.subscription.findFirst({ where: { id: subscriptionId, card_id: cardId } })
    if (!subscription || subscription.status !== 'active') return { created: 0, hasMore: false }
    const today = now.toZonedDateTimeISO(subscription.time_zone).toPlainDate().toString()
    const schedule = dueSubscriptionDates(
        subscription.starts_on.toISOString().slice(0, 10),
        subscription.next_due_on.toISOString().slice(0, 10),
        today,
    )
    if (!schedule.dates.length) return { created: 0, hasMore: false }
    const charges = await tx.charge.createManyAndReturn({
        data: schedule.dates.map((date) => ({
            card_id: cardId, subscription_id: subscription.id,
            subscription_due_on: dateOnlyToUtc(date), scheduled_for: dateOnlyToUtc(date),
            name: subscription.name, amount: subscription.amount,
            category_id: subscription.category_id, kind: 'single' as const, revision,
        })),
        skipDuplicates: true,
        select: { id: true },
    })
    await tx.subscription.update({ where: { id: subscription.id }, data: {
        next_due_on: dateOnlyToUtc(schedule.nextDueOn), revision,
    } })
    await recordCardChanges(cardId, revision, charges.map(({ id }) => ({
        entity: 'charge', entityId: id, operation: 'upsert',
    })), tx)
    return { created: charges.length, hasMore: schedule.hasMore }
}

/** Server-side batch entry point used by the authenticated cron route. */
export async function generateSubscriptionCharges({
    now = Temporal.Now.instant(), afterId, limit = 100,
}: { now?: Temporal.Instant; afterId?: string; limit?: number } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('Batch limit must be 1–100')
    const zones = await db.subscription.findMany({
        where: { status: 'active' }, distinct: ['time_zone'], select: { time_zone: true },
    })
    if (!zones.length) return { created: 0, nextCursor: null, pending: [] as string[], errors: [] as string[] }
    const subscriptions = await db.subscription.findMany({
        where: {
            status: 'active', ...(afterId ? { id: { gt: afterId } } : {}),
            OR: zones.map(({ time_zone }) => ({
                time_zone, next_due_on: { lte: dateOnlyToUtc(now.toZonedDateTimeISO(time_zone).toPlainDate().toString()) },
            })),
        },
        orderBy: { id: 'asc' }, take: limit, select: { id: true, card_id: true },
    })
    let created = 0
    const pending: string[] = []
    const errors: string[] = []
    for (const subscription of subscriptions) {
        try {
            const result = await db.$transaction(async (tx) => {
                const revision = await beginCardChange(subscription.card_id, tx)
                return generateDueSubscriptionCharges(tx, subscription.card_id, subscription.id, revision, now)
            }, { timeout: 30_000 })
            created += result.created
            if (result.hasMore) pending.push(subscription.id)
        } catch (error) {
            console.error('Subscription charge generation failed', subscription.id, error)
            errors.push(subscription.id)
        }
    }
    return { created, pending, errors, nextCursor: subscriptions.length === limit ? subscriptions.at(-1)!.id : null }
}
