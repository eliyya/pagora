import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Temporal } from 'temporal-polyfill'
import type { Prisma } from '@/db/generated/prisma/client'
import { generateDueSubscriptionCharges } from './subscription-charges'
import { dueSubscriptionDates, resumedSubscriptionDate } from './subscriptions'
import { runSubscriptionCron, validCronAuthorization } from './subscription-cron'

test('cron authorization requires the exact bearer secret', () => {
    assert.equal(validCronAuthorization('Bearer test-secret', 'test-secret'), true)
    for (const value of [null, '', 'test-secret', 'Bearer wrong', 'Bearer test-secret ']) {
        assert.equal(validCronAuthorization(value, 'test-secret'), false)
    }
})

test('cron traverses pages and makes another pass for remaining occurrences', async () => {
    const now = Temporal.Instant.from('2026-10-16T07:00:00Z')
    const cursors: Array<string | undefined> = []
    const results = [
        { created: 120, pending: ['a'], errors: [], nextCursor: 'a' },
        { created: 0, pending: [], errors: [], nextCursor: null },
        { created: 1, pending: [], errors: [], nextCursor: 'a' },
        { created: 0, pending: [], errors: [], nextCursor: null },
    ]
    const result = await runSubscriptionCron(async (options) => {
        cursors.push(options.afterId)
        assert.equal(options.now, now)
        return results.shift()!
    }, () => now)
    assert.deepEqual(cursors, [undefined, 'a', undefined, 'a'])
    assert.equal(result.created, 121)
    assert.equal(result.complete, true)
})

test('cron reports failed subscriptions and deadline exhaustion', async () => {
    const now = Temporal.Instant.from('2026-10-16T07:00:00Z')
    const failed = await runSubscriptionCron(async () => ({ created: 0, pending: [], errors: ['a'], nextCursor: null }), () => now)
    assert.equal(failed.complete, false)
    assert.equal(failed.failed, 1)
    let calls = 0
    const timed = await runSubscriptionCron(async () => { throw new Error('Must not run after deadline') }, () => calls++ ? now.add({ seconds: 241 }) : now)
    assert.equal(timed.timedOut, true)
    assert.equal(timed.batches, 0)
})

const date = (value: string) => new Date(`${value}T00:00:00.000Z`)
function fixture(status = 'active', zone = 'America/Mexico_City', start = '2026-01-31') {
    const subscription = { id: 'sub', card_id: 'card', name: 'Netflix', amount: 24900,
        category_id: 'category', status, time_zone: zone, starts_on: date(start), next_due_on: date(start), revision: 0 }
    const charges = new Map<string, Record<string, unknown>>()
    const changes: Record<string, unknown>[] = []
    const tx = {
        subscription: {
            findFirst: async () => subscription,
            update: async ({ data }: { data: Partial<typeof subscription> }) => Object.assign(subscription, data),
        },
        charge: { createManyAndReturn: async ({ data }: { data: Array<Record<string, unknown>> }) => {
            const created = []
            for (const charge of data) {
                const key = (charge.subscription_due_on as Date).toISOString().slice(0, 10)
                if (charges.has(key)) continue
                const id = `charge-${key}`
                charges.set(key, { ...charge, id })
                created.push({ id })
            }
            return created
        } },
        cardChange: { createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => changes.push(...data) },
    } as unknown as Prisma.TransactionClient
    return { tx, subscription, charges, changes }
}

test('short months preserve the original day, including leap years', () => {
    assert.deepEqual(dueSubscriptionDates('2028-01-31', '2028-01-31', '2028-03-31').dates,
        ['2028-01-31', '2028-02-29', '2028-03-31'])
    assert.equal(resumedSubscriptionDate('2026-01-31', '2026-02-28', '2026-03-01'), '2026-03-31')
})

test('batch limits preserve pending dates for the next invocation', () => {
    const first = dueSubscriptionDates('2000-01-15', '2000-01-15', '2026-10-13')
    assert.equal(first.dates.length, 120)
    assert.equal(first.nextDueOn, '2010-01-15')
    assert.equal(first.hasMore, true)
})

test('creates overdue charges, advances cursor and logs sync changes only once', async () => {
    const f = fixture()
    const now = Temporal.Instant.from('2026-03-31T18:00:00Z')
    assert.deepEqual(await generateDueSubscriptionCharges(f.tx, 'card', 'sub', 7, now), { created: 3, hasMore: false })
    assert.equal(f.subscription.next_due_on.toISOString().slice(0, 10), '2026-04-30')
    assert.equal(f.changes.length, 3)
    for (const charge of f.charges.values()) {
        assert.equal(charge.amount, 24900)
        assert.equal(charge.revision, 7)
        assert.equal(charge.category_id, 'category')
        assert.equal(charge.kind, 'single')
        assert.deepEqual(charge.scheduled_for, charge.subscription_due_on)
    }
    assert.ok(f.changes.every((change) => change.entity === 'charge' && change.version === 7 && change.operation === 'upsert'))
    assert.equal((await generateDueSubscriptionCharges(f.tx, 'card', 'sub', 8, now)).created, 0)
    assert.equal(f.changes.length, 3)
})

test('future, paused and canceled subscriptions do not create charges', async () => {
    for (const status of ['active', 'paused', 'canceled']) {
        const f = fixture(status)
        const now = Temporal.Instant.from(status === 'active' ? '2026-01-01T18:00:00Z' : '2026-03-31T18:00:00Z')
        assert.equal((await generateDueSubscriptionCharges(f.tx, 'card', 'sub', 1, now)).created, 0)
        assert.equal(f.changes.length, 0)
        assert.equal(f.subscription.revision, 0)
    }
})

test('first charge uses the subscription local day, not the UTC day', async () => {
    const f = fixture('active', 'America/Mexico_City', '2026-10-14')
    assert.equal((await generateDueSubscriptionCharges(f.tx, 'card', 'sub', 1, Temporal.Instant.from('2026-10-14T05:59:59Z'))).created, 0)
    assert.equal((await generateDueSubscriptionCharges(f.tx, 'card', 'sub', 2, Temporal.Instant.from('2026-10-14T06:00:00Z'))).created, 1)
})

test('existing occurrence is preserved and a deleted processed charge is not recreated', async () => {
    const f = fixture()
    f.charges.set('2026-01-31', { id: 'old', amount: 100 })
    const now = Temporal.Instant.from('2026-02-28T18:00:00Z')
    assert.equal((await generateDueSubscriptionCharges(f.tx, 'card', 'sub', 2, now)).created, 1)
    assert.equal(f.charges.get('2026-01-31')?.amount, 100)
    f.charges.delete('2026-02-28')
    assert.equal((await generateDueSubscriptionCharges(f.tx, 'card', 'sub', 3, now)).created, 0)
})
