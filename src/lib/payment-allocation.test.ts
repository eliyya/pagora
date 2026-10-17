import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allocatePayment, payableCharges } from './payment-allocation'

const charges = [5000, 3000, 3000, 4000].map((amount, index) => ({
    id: String(index), amount, paid: 0, kind: 'single',
    scheduled_for: `2026-10-0${index + 1}`,
    created_at: '2026-10-01T00:00:00Z',
}))

test('100 pays 50 and 30 fully, then 20 of the third charge', () => {
    const result = allocatePayment(charges, 10000)
    assert.deepEqual(result.allocations.map((item) => item.amount), [5000, 3000, 2000, 0])
    assert.equal(result.allocations[2].remainingBalance, 1000)
    assert.equal(result.remaining, 0)
})

test('manual selection leaves a gap until another charge covers it', () => {
    assert.equal(allocatePayment(charges, 10000, ['1', '2']).remaining, 4000)
    const result = allocatePayment(charges, 10000, ['1', '2', '3'])
    assert.equal(result.remaining, 0)
    assert.deepEqual(result.allocations.map((item) => item.amount), [0, 3000, 3000, 4000])
    assert.equal(allocatePayment(charges, 10000, []).remaining, 10000)
})

test('uses outstanding balances and reports insufficient funds to allocate', () => {
    const result = allocatePayment([{ ...charges[0], paid: 4500 }], 1000)
    assert.equal(result.appliedAmount, 500)
    assert.equal(result.remaining, 500)
})

test('includes future unpaid charges, excludes settled and parent charges, and sorts oldest first', () => {
    const result = payableCharges([
        charges[1], charges[0],
        { ...charges[2], paid: 3000 },
        { ...charges[3], kind: 'installment_parent' },
        { ...charges[0], id: 'future', scheduled_for: '2026-11-01' },
    ])
    assert.deepEqual(result.map((charge) => charge.id), ['0', '1', 'future'])
})
