import { describe, expect, it } from 'vitest'
import type { Transaction } from '../types'
import { classifyFixedSpend, splitFixedFlexible } from './fixedFlexible'

function txn(partial: Partial<Transaction>): Transaction {
  return {
    id: Math.random(),
    date: '2026-01-05',
    budgetMonth: '2026-01',
    description: 'x',
    accountId: 1,
    categoryId: 1,
    type: 'expense',
    amountCents: 1000,
    cancelled: false,
    status: 'posted',
    ...partial,
  }
}

/** Rent on the 1st, three months running — a textbook recurring pattern. */
function rentHistory(): Transaction[] {
  return ['2025-11', '2025-12', '2026-01'].map((m, i) =>
    txn({ id: i + 1, date: `${m}-01`, budgetMonth: m, description: 'Rent', amountCents: 100000 }),
  )
}

describe('classifyFixedSpend', () => {
  it('marks instalment-plan rows fixed regardless of pattern', () => {
    const classifier = classifyFixedSpend([])
    expect(classifier.isFixed(txn({ planId: 7, installmentIndex: 3 }))).toBe(true)
  })

  it('marks members of a regular recurring pattern fixed, one-offs flexible', () => {
    const history = rentHistory()
    const oneOff = txn({ id: 99, description: 'Concert tickets', amountCents: 4500 })
    const classifier = classifyFixedSpend([...history, oneOff])
    expect(classifier.isFixed(history[2]!)).toBe(true)
    expect(classifier.isFixed(oneOff)).toBe(false)
  })

  it('needs three occurrences before it trusts a pattern', () => {
    const twoOnly = rentHistory().slice(1)
    const classifier = classifyFixedSpend(twoOnly)
    expect(classifier.isFixed(twoOnly[1]!)).toBe(false)
  })

  it('leaves a weekly rhythm flexible — habits are what the pace clock watches', () => {
    const weekly = ['2026-01-03', '2026-01-10', '2026-01-17', '2026-01-24'].map((d, i) =>
      txn({ id: 50 + i, date: d, description: 'Supermarket', amountCents: 6000 }),
    )
    const classifier = classifyFixedSpend(weekly)
    expect(classifier.isFixed(weekly[3]!)).toBe(false)
  })

  it('calls the refund of a fixed charge fixed money coming back', () => {
    const history = rentHistory()
    const refund = txn({
      id: 80,
      date: '2026-01-15',
      description: 'Rent',
      type: 'refund',
      amountCents: 20000,
    })
    const unrelated = txn({
      id: 81,
      date: '2026-01-16',
      description: 'Shoes',
      type: 'refund',
      amountCents: 4000,
    })
    const classifier = classifyFixedSpend([...history, refund, unrelated])
    expect(classifier.isFixed(refund)).toBe(true)
    expect(classifier.isFixed(unrelated)).toBe(false)
  })
})

describe('splitFixedFlexible', () => {
  it('splits a month net of refunds, honouring basis and day cutoff', () => {
    const history = rentHistory()
    const txns = [
      ...history,
      txn({ id: 10, date: '2026-01-04', description: 'Groceries', amountCents: 6000 }),
      txn({ id: 11, date: '2026-01-20', description: 'Dinner', amountCents: 3000 }),
      txn({ id: 12, date: '2026-01-06', description: 'Return', type: 'refund', amountCents: 1000 }),
      txn({ id: 13, date: '2026-01-09', description: 'Gadget', amountCents: 2000, status: 'forecast' }),
    ]
    const classifier = classifyFixedSpend(txns)

    const full = splitFixedFlexible(txns, classifier, '2026-01', 'committed')
    expect(full.fixedCents).toBe(100000)
    expect(full.flexibleCents).toBe(6000 + 3000 - 1000 + 2000)

    const paid = splitFixedFlexible(txns, classifier, '2026-01', 'paid')
    expect(paid.flexibleCents).toBe(6000 + 3000 - 1000)

    const throughDay10 = splitFixedFlexible(txns, classifier, '2026-01', 'committed', 10)
    expect(throughDay10.flexibleCents).toBe(6000 - 1000 + 2000)
  })
})
