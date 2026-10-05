import { describe, expect, it } from 'vitest'
import type { Transaction } from '../types'
import { sameDaysCut } from './analyticsPeriod'
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

  it('cuts the open month at the same days the headline numbers use', () => {
    const txns = [
      txn({ type: 'income', date: '2026-03-01', amountCents: 300000 }),
      txn({ type: 'income', date: '2026-03-25', amountCents: 50000 }),
      txn({ description: 'Groceries', date: '2026-03-04', amountCents: 40000 }),
      txn({ description: 'Gadget', date: '2026-03-20', amountCents: 20000, status: 'forecast' }),
      txn({ type: 'investment', date: '2026-03-28', amountCents: 60000 }),
    ]
    const cut = sameDaysCut('2026-03', '2026-03-10')
    const a = computeAllocation(txns, classifyFixedSpend(txns), '2026-03', 'committed', cut)
    expect(a.incomeCents).toBe(300000)
    expect(a.flexibleCents).toBe(40000)
    expect(a.investedCents).toBe(0)
    expect(a.leftoverCents).toBe(260000)

    const whole = computeAllocation(txns, classifyFixedSpend(txns), '2026-03', 'committed')
    expect(whole.incomeCents).toBe(350000)
    expect(whole.flexibleCents).toBe(60000)
  })
})
