import { Temporal } from 'temporal-polyfill'

// Prisma and persisted records use Date. Convert at the boundary only.
export function plainDate(value: Date | string) {
    return Temporal.PlainDate.from(value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10))
}

export function instant(value: Date | string | number) {
    return typeof value === 'number' ? Temporal.Instant.fromEpochMilliseconds(value) : Temporal.Instant.from(value instanceof Date ? value.toISOString() : value)
}

export function monthKey(offset = 0) {
    return Temporal.Now.plainDateISO().with({ day: 1 }).add({ months: offset }).toString().slice(0, 7)
}

function billingStartForMonth(month: Temporal.PlainDate, closingDay: number) {
    return month.with({ day: closingDay }, { overflow: 'constrain' }).add({ days: 1 })
}

export function getBillingPeriodStart(value: Date | string | Temporal.PlainDate, closingDay: number) {
    const date = value instanceof Temporal.PlainDate ? value : plainDate(value)
    const month = date.with({ day: 1 })
    const start = billingStartForMonth(month, closingDay)
    return Temporal.PlainDate.compare(date, start) >= 0 ? start : billingStartForMonth(month.subtract({ months: 1 }), closingDay)
}

export function getNextBillingPeriodStart(start: Temporal.PlainDate, closingDay: number) {
    const closingMonth = start.subtract({ days: 1 }).with({ day: 1 })
    return billingStartForMonth(closingMonth.add({ months: 1 }), closingDay)
}

export function formatBillingPeriodLabel(key: string, closingDay: number) {
    const start = Temporal.PlainDate.from(key)
    const endExclusive = getNextBillingPeriodStart(start, closingDay)
    const nextMonth = start.with({ day: 1 }).add({ months: 1 })
    const firstDays = start.until(Temporal.PlainDate.compare(nextMonth, endExclusive) < 0 ? nextMonth : endExclusive).days
    const secondDays = Temporal.PlainDate.compare(nextMonth, endExclusive) < 0 ? nextMonth.until(endExclusive).days : 0
    // A tie uses the starting month.
    const selected = secondDays > firstDays ? nextMonth : start
    return selected.toLocaleString('es-MX', { month: 'long', year: '2-digit' })
}

export function getContinuousBillingPeriodKeys(periodKeys: Set<string>, closingDay: number) {
    const sorted = [...periodKeys].sort()
    if (!sorted.length) return []
    const last = Temporal.PlainDate.from(sorted.at(-1)!)
    const keys: string[] = []
    for (let start = Temporal.PlainDate.from(sorted[0]); Temporal.PlainDate.compare(start, last) <= 0; start = getNextBillingPeriodStart(start, closingDay)) keys.push(start.toString())
    return keys
}

export function epochMilliseconds(value: Date | string) {
    try { return instant(value).epochMilliseconds } catch { return Number.NaN }
}
