import { describe, expect, it } from 'vitest'
import type { Transaction } from '../types'
import { computeAllocation } from './allocation'
import { classifyFixedSpend } from './fixedFlexible'

function txn(partial: Partial<Transaction>): Transaction {
  return {
    id: Math.random(),
    date: '2026-03-05',
    budgetMonth: '2026-03',
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

function rentHistory(): Transaction[] {
  return ['2026-01', '2026-02', '2026-03'].map((m) =>
    txn({ date: `${m}-01`, budgetMonth: m, description: 'Rent', amountCents: 100000 }),
  )
}

describe('computeAllocation', () => {
  it('splits income into fixed, flexible, invested and leftover', () => {
    const txns = [
      ...rentHistory(),
      txn({ type: 'income', amountCents: 300000 }),
      txn({ description: 'Groceries', amountCents: 40000 }),
      txn({ type: 'investment', amountCents: 60000 }),
    ]
    const a = computeAllocation(txns, classifyFixedSpend(txns), '2026-03', 'committed')
    expect(a.incomeCents).toBe(300000)
    expect(a.fixedCents).toBe(100000)
    expect(a.flexibleCents).toBe(40000)
    expect(a.investedCents).toBe(60000)
    expect(a.leftoverCents).toBe(100000)
    expect(a.overspent).toBe(false)
  })

  it('flags an overspent month instead of hiding the negative leftover', () => {
    const txns = [txn({ type: 'income', amountCents: 50000 }), txn({ amountCents: 80000 })]
    const a = computeAllocation(txns, classifyFixedSpend(txns), '2026-03', 'committed')
    expect(a.leftoverCents).toBe(-30000)
    expect(a.overspent).toBe(true)
  })
})
