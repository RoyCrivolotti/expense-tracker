import { describe, expect, it } from 'vitest'
import type { Category, Label, Transaction } from '../types'
import { computeSpendingGroups, sortSpendingRows, type SpendingGroupRow } from './spendingGroups'

const categories: Category[] = [
  { id: 1, name: 'Groceries', monthlyBudgetCents: 40000, sortOrder: 0, active: true },
  { id: 2, name: 'Dining', monthlyBudgetCents: 0, sortOrder: 1, active: true },
]
const labels: Label[] = [
  { id: 1, name: 'Porto trip', color: '#f59e0b', sortOrder: 0, active: true },
  { id: 2, name: 'Work', color: '#10b981', sortOrder: 1, active: true },
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

const MONTHS = ['2025-12', '2026-01', '2026-02', '2026-03']

describe('computeSpendingGroups by category', () => {
  const txns = [
    txn({ budgetMonth: '2026-02', date: '2026-02-04', description: 'shop feb', amountCents: 30000 }),
    txn({ description: 'shop mar', amountCents: 20000 }),
    txn({ description: 'gadget', amountCents: 10000, status: 'forecast' }),
    txn({ categoryId: 2, description: 'dinner', amountCents: 5000 }),
    txn({ description: 'return', type: 'refund', amountCents: 2000 }),
  ]

  it('ranks rows by current spend with budget, pace tick and unpaid share', () => {
    const rows = computeSpendingGroups(
      { transactions: txns, categories, labels },
      { months: MONTHS, month: '2026-03', basis: 'committed', today: '2026-04-10', groupBy: 'category' },
    )
    expect(rows.map((r) => r.name)).toEqual(['Groceries', 'Dining'])
    const groceries = rows[0]!
    expect(groceries.currentCents).toBe(20000 + 10000 - 2000)
    expect(groceries.unpaidCents).toBe(10000)
    expect(groceries.budgetCents).toBe(40000)
    // Closed month: the pace tick sits at the full budget.
    expect(groceries.shouldBeTodayCents).toBe(40000)
    expect(groceries.spark.find((s) => s.month === '2026-02')?.cents).toBe(30000)
    expect(groceries.avg3Cents).toBe(Math.round(30000 / 3))
    expect(rows[1]?.budgetCents).toBeNull()
  })

  it('clamps the open month and its pace tick to the same days', () => {
    const rows = computeSpendingGroups(
      { transactions: txns, categories, labels },
      { months: MONTHS, month: '2026-03', basis: 'committed', today: '2026-03-04', groupBy: 'category' },
    )
    // Day-5 transactions fall outside day 4.
    expect(rows.find((r) => r.name === 'Groceries')?.currentCents).toBe(0)
    expect(rows.find((r) => r.name === 'Groceries')?.shouldBeTodayCents).toBe(
      Math.round(40000 * (4 / 31)),
    )
  })

  it("clamps the open month's spark point like the row total", () => {
    const rows = computeSpendingGroups(
      { transactions: txns, categories, labels },
      { months: MONTHS, month: '2026-03', basis: 'committed', today: '2026-03-04', groupBy: 'category' },
    )
    const groceries = rows.find((r) => r.name === 'Groceries')!
    // The spark's March point and the row total agree; February stays whole.
    expect(groceries.spark.find((s) => s.month === '2026-03')?.cents).toBe(0)
    expect(groceries.spark.find((s) => s.month === '2026-02')?.cents).toBe(30000)
  })

  it('counts the open month from its own first day under a rollover', () => {
    // Day-13 rollover on Mar 5: the March budget month began Feb 13, so a Feb 20 row is inside it.
    const rolled = [
      txn({ date: '2026-02-20', description: 'early', amountCents: 28000 }),
      txn({ date: '2026-03-08', description: 'later', amountCents: 9000 }),
    ]
    const rows = computeSpendingGroups(
      { transactions: rolled, categories, labels },
      {
        months: MONTHS,
        month: '2026-03',
        basis: 'committed',
        today: '2026-03-05',
        openMonth: '2026-03',
        rolloverDay: 13,
        groupBy: 'category',
      },
    )
    const groceries = rows.find((r) => r.name === 'Groceries')!
    expect(groceries.currentCents).toBe(28000)
    // 21 of the budget month's 28 days have passed.
    expect(groceries.shouldBeTodayCents).toBe(Math.round(40000 * (21 / 28)))
  })
})

describe('computeSpendingGroups by label and description', () => {
  it('counts a transaction in every label it carries', () => {
    const txns = [
      txn({ description: 'flight', amountCents: 30000, labelIds: [1, 2] }),
      txn({ description: 'hotel', amountCents: 20000, labelIds: [1] }),
      txn({ description: 'unlabelled', amountCents: 5000 }),
    ]
    const rows = computeSpendingGroups(
      { transactions: txns, categories, labels },
      { months: MONTHS, month: '2026-03', basis: 'committed', today: '2026-04-10', groupBy: 'label' },
    )
    expect(rows.map((r) => r.name)).toEqual(['Porto trip', 'Work'])
    expect(rows[0]?.currentCents).toBe(50000)
    expect(rows[1]?.currentCents).toBe(30000)
    expect(rows[0]?.color).toBe('#f59e0b')
  })

  it('groups rows by normalized description', () => {
    const txns = [
      txn({ description: ' Market Hall ', amountCents: 10000 }),
      txn({ description: 'market hall', amountCents: 5000 }),
      txn({ description: 'Bakery', amountCents: 2000 }),
    ]
    const rows = computeSpendingGroups(
      { transactions: txns, categories, labels },
      { months: MONTHS, month: '2026-03', basis: 'committed', today: '2026-04-10', groupBy: 'description' },
    )
    expect(rows[0]).toMatchObject({ key: 'market hall', currentCents: 15000, txnCount: 2 })
  })

  it('splits fixed from flexible using the recurring classifier', () => {
    const rent = ['2026-01', '2026-02', '2026-03'].map((m) =>
      txn({ date: `${m}-01`, budgetMonth: m, description: 'Rent', amountCents: 100000 }),
    )
    const rows = computeSpendingGroups(
      { transactions: [...rent, txn({ description: 'one-off', amountCents: 7000 })], categories, labels },
      { months: MONTHS, month: '2026-03', basis: 'committed', today: '2026-04-10', groupBy: 'fixedFlexible' },
    )
    expect(rows.find((r) => r.key === 'fixed')?.currentCents).toBe(100000)
    expect(rows.find((r) => r.key === 'flexible')?.currentCents).toBe(7000)
  })
})

describe('sortSpendingRows', () => {
  const row = (name: string, currentCents: number, txnCount: number): SpendingGroupRow => ({
    key: name,
    name,
    currentCents,
    unpaidCents: 0,
    budgetCents: null,
    shouldBeTodayCents: null,
    spark: [],
    avg3Cents: null,
    txnCount,
  })
  const rows = [row('Rent', 120000, 1), row('Coffee', 1200, 3), row('Taxi', 3000, 3), row('Gift', 500, 1)]

  it('keeps the order it is given by amount', () => {
    expect(sortSpendingRows(rows, 'amount').map((r) => r.name)).toEqual(['Rent', 'Coffee', 'Taxi', 'Gift'])
  })

  it('ranks by item count, then amount, without touching the input', () => {
    expect(sortSpendingRows(rows, 'items').map((r) => r.name)).toEqual(['Taxi', 'Coffee', 'Rent', 'Gift'])
    expect(rows.map((r) => r.name)).toEqual(['Rent', 'Coffee', 'Taxi', 'Gift'])
  })
})
