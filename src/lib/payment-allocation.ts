import { Temporal } from 'temporal-polyfill'
import { instant, plainDate } from './dates'

type PayableCharge = {
    id: string
    kind: string
    amount: number
    paid: number
    scheduled_for: Date | string
    created_at: Date | string
}

export function payableCharges<T extends PayableCharge>(charges: T[]) {
    return charges
        .filter(
            (charge) =>
                charge.kind !== 'installment_parent' &&
                charge.amount > charge.paid,
        )
        .sort(
            (a, b) =>
                Temporal.PlainDate.compare(
                    plainDate(a.scheduled_for),
                    plainDate(b.scheduled_for),
                ) ||
                Temporal.Instant.compare(
                    instant(a.created_at),
                    instant(b.created_at),
                ) ||
                (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
        )
}

// Input is already ordered oldest first. All amounts are integer cents.
export function allocatePayment<T extends { id: string; amount: number; paid: number }>(
    charges: T[], amount: number, selectedIds?: string[],
) {
    const selected = selectedIds ? new Set(selectedIds) : null
    let remaining = amount
    const allocations = charges.map((charge) => {
        const owed = Math.max(0, charge.amount - charge.paid)
        const applied = !selected || selected.has(charge.id) ? Math.min(owed, Math.max(0, remaining)) : 0
        remaining -= applied
        return { charge, amount: applied, remainingBalance: owed - applied }
    })
    return { allocations, remaining, appliedAmount: amount - remaining }
}
