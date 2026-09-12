import { describe, expect, it } from 'vitest'
import type { Transaction } from '../types'
import { makeTransaction } from '../../testing/factories'
import { buildReimbursementLinks } from './reimbursementLinks'

const payment = makeTransaction({ id: 99, type: 'refund', amountCents: 12_000, date: '2026-06-14' })

function claimed(id: number, overrides: Partial<Transaction> = {}): Transaction {
  return makeTransaction({ id, flagId: 1, settledBy: 99, ...overrides })
}

describe('buildReimbursementLinks', () => {
  it('finds the payment that settled a transaction', () => {
    const links = buildReimbursementLinks([claimed(1), payment])

    expect(links.settlementFor(1)).toBe(payment)
  })

  it('finds everything a payment settled, oldest first', () => {
    const links = buildReimbursementLinks([
      claimed(2, { date: '2026-05-09' }),
      claimed(1, { date: '2026-05-02' }),
      payment,
    ])

    expect(links.settledBy(99).map((t) => t.id)).toEqual([1, 2])
  })

  it('says nothing for a transaction that was never reimbursed', () => {
    const links = buildReimbursementLinks([makeTransaction({ id: 1 })])

    expect(links.settlementFor(1)).toBeUndefined()
    expect(links.settledBy(1)).toEqual([])
  })

  it('ignores a link to a payment that is no longer there', () => {
    // The payment can be deleted in another tab before this dataset refreshes;
    // a dangling id must not throw on a transaction the user just opened.
    const links = buildReimbursementLinks([claimed(1)])

    expect(links.settlementFor(1)).toBeUndefined()
  })

  it('keeps two payments' + "' rows apart", () => {
    const other = makeTransaction({ id: 98, type: 'refund' })
    const links = buildReimbursementLinks([
      claimed(1),
      claimed(2, { settledBy: 98 }),
      payment,
      other,
    ])

    expect(links.settledBy(99).map((t) => t.id)).toEqual([1])
    expect(links.settledBy(98).map((t) => t.id)).toEqual([2])
  })
})
