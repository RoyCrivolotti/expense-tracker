import { describe, expect, it } from 'vitest'
import type { Category, InstallmentPlan, Transaction } from '../types'
import { detectedFixedCosts } from './fixedCosts'
import { expectedFixedCents } from './spendingPace'

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
  { id: 1, name: 'Home', monthlyBudgetCents: 120000, sortOrder: 0, active: true },
  { id: 2, name: 'Phone', monthlyBudgetCents: 5000, sortOrder: 1, active: true },
  { id: 3, name: 'Unbudgeted', monthlyBudgetCents: 0, sortOrder: 2, active: true },
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

const monthly = (description: string, categoryId: number, cents: number, months: string[]) =>
  months.map((m) =>
    txn({ date: `${m}-01`, budgetMonth: m, description, categoryId, amountCents: cents }),
  )

describe('detectedFixedCosts', () => {
  const rows = [
    ...monthly('Rent', 1, 100000, ['2026-01', '2026-02', '2026-03']),
    ...monthly('Cloud', 3, 900, ['2026-01', '2026-02', '2026-03']),
    // Gone for six months by March: still detected as fixed, but not in this month's budget.
    ...monthly('Old gym', 1, 3000, ['2025-08', '2025-09', '2025-10']),
    // Weekly groceries are a habit, never fixed.
    ...['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22'].map((date) =>
      txn({ date, description: 'Groceries', amountCents: 5000 }),
    ),
    // Quarterly insurance: fixed, but lumpy, so left out of the monthly budget.
    ...['2025-06-10', '2025-09-10', '2025-12-10', '2026-03-10'].map((date) =>
      txn({ date, budgetMonth: date.slice(0, 7), description: 'Insurance', amountCents: 24000 }),
    ),
  ]

  it('lists patterns with their rhythm, newest charge and whether the pace budget takes them', () => {
    const items = detectedFixedCosts(rows, [], categories, '2026-03')
    const byName = Object.fromEntries(items.map((i) => [i.name, i]))

    expect(byName['Rent']).toMatchObject({
      kind: 'pattern',
      frequency: 'monthly',
      amountCents: 100000,
      lastMonth: '2026-03',
      inPaceBudget: true,
    })
    expect(byName['Insurance']).toMatchObject({ frequency: 'quarterly', inPaceBudget: false })
    expect(byName['Old gym']).toMatchObject({ lastMonth: '2025-10', inPaceBudget: false })
    expect(byName['Cloud']?.inPaceBudget).toBe(false)
    expect(byName['Groceries']).toBeUndefined()
  })

  it('puts what is in the pace budget first, then by size', () => {
    const names = detectedFixedCosts(rows, [], categories, '2026-03').map((i) => i.name)
    expect(names[0]).toBe('Rent')
    expect(names.indexOf('Insurance')).toBeLessThan(names.indexOf('Cloud'))
  })

  it('includes a running instalment plan with which payment is due', () => {
    const items = detectedFixedCosts([], [plan], categories, '2026-03')
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      kind: 'instalment',
      name: 'Phone',
      amountCents: 4000,
      payment: { index: 10, total: 24 },
      inPaceBudget: true,
    })
  })

  it('leaves out plans that have ended, have not begun or are paused', () => {
    expect(detectedFixedCosts([], [{ ...plan, totalCount: 3 }], categories, '2026-03')).toEqual([])
    expect(detectedFixedCosts([], [{ ...plan, anchorBudgetMonth: '2026-06' }], categories, '2026-03')).toEqual([])
    expect(detectedFixedCosts([], [{ ...plan, active: false }], categories, '2026-03')).toEqual([])
  })

  it('agrees with the pace budget: what is flagged in it sums to the fixed charges expected', () => {
    const items = detectedFixedCosts(rows, [plan], categories, '2026-03')
    const inBudget = items.filter((i) => i.inPaceBudget).reduce((s, i) => s + i.amountCents, 0)
    expect(inBudget).toBe(expectedFixedCents(rows, [plan], categories, '2026-03'))
  })
})
