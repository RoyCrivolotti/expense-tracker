import { describe, expect, it } from 'vitest'
import type { Category, Transaction } from '../types'
import { computeSpendingGroupDetail } from './spendingGroupDetail'

const categories: Category[] = [
  { id: 1, name: 'Groceries', monthlyBudgetCents: 30000, sortOrder: 0, active: true },
]

let nextId = 1
function txn(partial: Partial<Transaction>): Transaction {
  return {
    id: nextId++,
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

const MONTHS = ['2026-01', '2026-02', '2026-03']

describe('computeSpendingGroupDetail', () => {
  const txns = [
    txn({ budgetMonth: '2026-01', date: '2026-01-05', amountCents: 20000 }),
    txn({ budgetMonth: '2026-02', date: '2026-02-05', amountCents: 40000 }),
    txn({ amountCents: 25000, description: 'big shop' }),
    txn({ amountCents: 3000, description: 'top-up' }),
    txn({ amountCents: 9000, description: 'other category', categoryId: 2 }),
  ]

  it('builds the history with budget, stats, worst month and months over', () => {
    const d = computeSpendingGroupDetail(
      { transactions: txns, categories },
      { months: MONTHS, month: '2026-03', basis: 'committed', groupBy: 'category', key: '1' },
    )
    expect(d.history.map((h) => h.actualCents)).toEqual([20000, 40000, 28000])
    expect(d.history[0]?.budgetCents).toBe(30000)
    expect(d.meanCents).toBe(Math.round((20000 + 40000 + 28000) / 3))
    expect(d.worst).toEqual({ month: '2026-02', cents: 40000 })
    expect(d.monthsOver).toBe(1)
  })

  it('lists the selected month biggest transactions, largest first', () => {
    const d = computeSpendingGroupDetail(
      { transactions: txns, categories },
      { months: MONTHS, month: '2026-03', basis: 'committed', groupBy: 'category', key: '1', topCount: 1 },
    )
    expect(d.topTransactions.map((t) => t.description)).toEqual(['big shop'])
  })

  it('clamps the selected open month to the same days the row total uses', () => {
    const d = computeSpendingGroupDetail(
      { transactions: txns, categories },
      {
        months: MONTHS,
        month: '2026-03',
        basis: 'committed',
        groupBy: 'category',
        key: '1',
        today: '2026-03-04',
        openMonth: '2026-03',
      },
    )
    // The day-5 March rows fall outside day 4; closed months stay whole.
    expect(d.history.map((h) => h.actualCents)).toEqual([20000, 40000, 0])
    expect(d.topTransactions).toEqual([])
  })

  it('matches descriptions by their normalized text with no budget line', () => {
    const d = computeSpendingGroupDetail(
      { transactions: txns, categories },
      { months: MONTHS, month: '2026-03', basis: 'committed', groupBy: 'description', key: 'big shop' },
    )
    expect(d.history[2]?.actualCents).toBe(25000)
    expect(d.history[2]?.budgetCents).toBeNull()
  })
})
