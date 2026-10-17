import { Temporal } from 'temporal-polyfill'

export function dueSubscriptionDates(anchor: string, cursor: string, today: string, limit = 120) {
    const dates: string[] = []
    let next = resumedSubscriptionDate(anchor, cursor, cursor)
    while (Temporal.PlainDate.compare(Temporal.PlainDate.from(next), Temporal.PlainDate.from(today)) <= 0 && dates.length < limit) {
        dates.push(next)
        const after = Temporal.PlainDate.from(next).add({ days: 1 }).toString()
        next = resumedSubscriptionDate(anchor, after, after)
    }
    return { dates, nextDueOn: next, hasMore: next <= today }
}

/** Keep the original monthly anchor, skipping dates before the resume day or cursor. */
export function resumedSubscriptionDate(anchor: string, cursor: string, today: string) {
    const start = Temporal.PlainDate.from(anchor)
    const lower = [cursor, today, anchor].sort().at(-1)!
    const target = Temporal.PlainDate.from(lower)
    const months = (target.year - start.year) * 12 + target.month - start.month
    const candidate = start.add({ months })
    return (Temporal.PlainDate.compare(candidate, target) < 0
        ? start.add({ months: months + 1 })
        : candidate).toString()
}
