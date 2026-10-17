import { createHash, timingSafeEqual } from 'node:crypto'
import { Temporal } from 'temporal-polyfill'

export function validCronAuthorization(header: string | null, secret: string) {
    const hash = (value: string) => createHash('sha256').update(value).digest()
    return timingSafeEqual(hash(header ?? ''), hash(`Bearer ${secret}`))
}

type Batch = (options: { now: Temporal.Instant; afterId?: string; limit: number }) => Promise<{
    created: number; pending: string[]; errors: string[]; nextCursor: string | null
}>

export async function runSubscriptionCron(batch: Batch, clock = () => Temporal.Now.instant()) {
    const now = clock()
    const deadline = now.add({ seconds: 240 })
    let afterId: string | undefined
    let pending = false
    let created = 0
    let batches = 0
    const failed = new Set<string>()
    while (Temporal.Instant.compare(clock(), deadline) < 0) {
        // One subscription per transaction keeps the deadline check between units of work.
        const result = await batch({ now, afterId, limit: 1 })
        batches++
        created += result.created
        result.errors.forEach((id) => failed.add(id))
        pending ||= result.pending.length > 0
        if (result.nextCursor) {
            afterId = result.nextCursor
        } else if (pending) {
            afterId = undefined
            pending = false
        } else {
            return { complete: failed.size === 0, created, batches, failed: failed.size, timedOut: false }
        }
    }
    return { complete: false, created, batches, failed: failed.size, timedOut: true }
}
