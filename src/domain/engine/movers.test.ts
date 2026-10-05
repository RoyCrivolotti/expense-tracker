import { describe, expect, it } from 'vitest'
import type { Category, Transaction } from '../types'
import { classifyFixedSpend } from './fixedFlexible'
import { computeMovers } from './movers'

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

const categories: Category[] = [
  { id: 1, name: 'Groceries', monthlyBudgetCents: 40000, sortOrder: 0, active: true },
  { id: 2, name: 'Dining', monthlyBudgetCents: 20000, sortOrder: 1, active: true },
]

const MONTHS = ['2025-12', '2026-01', '2026-02', '2026-03']

describe('computeMovers', () => {
  it('ranks categories by distance from their 3-month average, largest first', () => {
    // Distinct descriptions keep these one-offs, not recurring (which would read as fixed).
    const txns = [
      // Groceries: steady 300 €/month, then 600 € in March.
      ...['2025-12', '2026-01', '2026-02'].map((m) =>
        txn({ date: `${m}-05`, budgetMonth: m, categoryId: 1, description: `g ${m}`, amountCents: 30000 }),
      ),
      txn({ date: '2026-03-05', categoryId: 1, description: 'g mar', amountCents: 60000 }),
      // Dining: steady 100 €, then 110 € — a small move.
      ...['2025-12', '2026-01', '2026-02'].map((m) =>
        txn({ date: `${m}-08`, budgetMonth: m, categoryId: 2, description: `d ${m}`, amountCents: 10000 }),
      ),
      txn({ date: '2026-03-08', categoryId: 2, description: 'd mar', amountCents: 11000 }),
    ]
    const movers = computeMovers(txns, categories, classifyFixedSpend(txns), {
      months: MONTHS,
      month: '2026-03',
      basis: 'committed',
      today: '2026-04-10',
    })
    expect(movers[0]).toMatchObject({ categoryId: 1, currentCents: 60000, baselineCents: 30000, deltaCents: 30000 })
    expect(movers[1]).toMatchObject({ categoryId: 2, deltaCents: 1000 })
  })

  it('compares the open month only against the same days of the window', () => {
    const txns = [
      txn({ date: '2026-02-20', budgetMonth: '2026-02', categoryId: 1, amountCents: 30000 }),
      txn({ date: '2026-03-05', categoryId: 1, amountCents: 5000 }),
    ]
    const movers = computeMovers(txns, categories, classifyFixedSpend(txns), {
      months: MONTHS,
      month: '2026-03',
      basis: 'committed',
      today: '2026-03-10',
    })
    // February's day-20 spend is outside the first 10 days, so the baseline is 0.
    expect(movers[0]).toMatchObject({ categoryId: 1, currentCents: 5000, baselineCents: 0 })
  })
})
