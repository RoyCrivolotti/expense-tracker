import { describe, expect, it } from 'vitest'
import type { Category, InstallmentPlan, Transaction } from '../types'
import { classifyFixedSpend } from './fixedFlexible'
import { computeSpendingPace, expectedFixedCents } from './spendingPace'

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
  { id: 1, name: 'Rent', monthlyBudgetCents: 100000, sortOrder: 0, active: true },
  { id: 2, name: 'Groceries', monthlyBudgetCents: 40000, sortOrder: 1, active: true },
  { id: 3, name: 'Old', monthlyBudgetCents: 99999, sortOrder: 2, active: false },
]

const plan: InstallmentPlan = {
  id: 1,
  description: 'Phone',
  totalCount: 24,
  amountCents: 4000,
  accountId: 1,
  categoryId: 2,
  type: 'expense',
  anchorBudgetMonth: '2025-06',
  startInstallmentIndex: 1,
  active: true,
}

function rentHistory(): Transaction[] {
  return ['2026-01', '2026-02', '2026-03'].map((m) =>
    txn({ date: `${m}-01`, budgetMonth: m, description: 'Rent', amountCents: 100000 }),
  )
}

describe('expectedFixedCents', () => {
  it('counts a due instalment and a monthly recurring pattern, once each', () => {
    const txns = rentHistory()
    expect(expectedFixedCents(txns, [plan], '2026-03')).toBe(100000 + 4000)
  })

  it('counts nothing for a plan that has ended or not begun', () => {
    const ended = { ...plan, totalCount: 3 } // final month 2025-08
    expect(expectedFixedCents([], [ended], '2026-03')).toBe(0)
    const future = { ...plan, anchorBudgetMonth: '2026-06' }
    expect(expectedFixedCents([], [future], '2026-03')).toBe(0)
  })
})

describe('computeSpendingPace', () => {
  const txns = [
    ...rentHistory(),
    txn({ date: '2026-03-04', description: 'Groceries run', amountCents: 9000 }),
    txn({ date: '2026-03-28', description: 'Late dinner', amountCents: 5000 }),
    txn({ date: '2026-02-04', budgetMonth: '2026-02', description: 'Groceries run', amountCents: 6000 }),
  ]
  const classifier = classifyFixedSpend(txns)

  it('clocks the open month through today and projects to month end', () => {
    const pace = computeSpendingPace(txns, categories, [], classifier, {
      month: '2026-03',
      today: '2026-03-10',
      basis: 'committed',
      prevMonth: '2026-02',
    })
    expect(pace.open).toBe(true)
    expect(pace.dayOfMonth).toBe(10)
    expect(pace.daysInMonth).toBe(31)
    // Flexible spend so far: the day-4 groceries; the day-28 dinner is still ahead.
    expect(pace.flexibleSpentCents).toBe(9000)
    // Budgets of active categories (140.000) minus the recurring rent (100.000).
    expect(pace.flexibleBudgetCents).toBe(40000)
    expect(pace.shouldBeTodayCents).toBe(Math.round(40000 * (10 / 31)))
    expect(pace.projectedCents).toBe(Math.round(9000 / (10 / 31)))
    expect(pace.lastMonthSameDayCents).toBe(6000)
  })

  it('reports a closed month as not open, with the spend as its own projection', () => {
    const pace = computeSpendingPace(txns, categories, [], classifier, {
      month: '2026-02',
      today: '2026-03-10',
      basis: 'committed',
      prevMonth: '2026-01',
    })
    expect(pace.open).toBe(false)
    expect(pace.projectedCents).toBe(pace.flexibleSpentCents)
  })

  it('never reports a negative flexible budget', () => {
    const tight: Category[] = [{ id: 1, name: 'Rent', monthlyBudgetCents: 50000, sortOrder: 0, active: true }]
    const pace = computeSpendingPace(rentHistory(), tight, [], classifyFixedSpend(rentHistory()), {
      month: '2026-03',
      today: '2026-03-10',
      basis: 'committed',
      prevMonth: null,
    })
    expect(pace.flexibleBudgetCents).toBe(0)
    expect(pace.lastMonthSameDayCents).toBeNull()
  })
})
