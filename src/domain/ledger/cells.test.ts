import { describe, expect, it } from 'vitest'
import { makeTransaction } from '../../testing/factories'
import type { Account, AccountStatement } from '../types'
import { buildCells, cellRows, isCellRow } from './cells'

const row = (id: number, overrides: Parameters<typeof makeTransaction>[0] = {}) =>
  makeTransaction({ id, budgetMonth: '2025-03', date: '2025-03-10', ...overrides })

describe('buildCells', () => {
  it('sums rows that share a month, account, category, type, cancelled flag and sign', () => {
    const cells = buildCells([row(1, { amountCents: 100 }), row(2, { amountCents: 250 })])
    expect(cells).toEqual([
      {
        budgetMonth: '2025-03',
        accountId: 1,
        categoryId: 1,
        type: 'expense',
        cancelled: false,
        sign: 1,
        amountCents: 350,
        count: 2,
      },
    ])
  })

  it.each([
    ['month', { budgetMonth: '2025-04' }],
    ['account', { accountId: 2 }],
    ['category', { categoryId: 2 }],
    ['type', { type: 'refund' as const }],
    ['cancelled flag', { cancelled: true }],
  ])('keeps rows that differ in %s apart', (_name, change) => {
    expect(buildCells([row(1), row(2, change)])).toHaveLength(2)
  })

  it('keeps a withdrawal apart from a deposit, since some engines read the sign', () => {
    const cells = buildCells([
      row(1, { type: 'investment', amountCents: 500 }),
      row(2, { type: 'investment', amountCents: -200 }),
    ])
    expect(cells.map((c) => [c.sign, c.amountCents])).toEqual([
      [-1, -200],
      [1, 500],
    ])
  })

  it('keeps a cell whose sum is zero, so the month still exists', () => {
    expect(buildCells([row(1, { amountCents: 0 })])).toEqual([
      expect.objectContaining({ sign: 0, amountCents: 0, count: 1 }),
    ])
  })

  it('keeps a month that has only cancelled rows', () => {
    const cells = buildCells([row(1, { cancelled: true, status: 'cancelled' })])
    expect(cells).toEqual([expect.objectContaining({ budgetMonth: '2025-03', cancelled: true, count: 1 })])
  })

  it('lists cells in calendar order whatever order the rows come in', () => {
    const rows = [row(1, { budgetMonth: '2025-05' }), row(2, { budgetMonth: '2025-02' }), row(3)]
    expect(buildCells(rows).map((c) => c.budgetMonth)).toEqual(['2025-02', '2025-03', '2025-05'])
    expect(buildCells([...rows].reverse())).toEqual(buildCells(rows))
  })

  it('orders cells of one month by account, category, type, cancelled flag and sign', () => {
    const rows = [
      row(1, { accountId: 2 }),
      row(2, { accountId: 1, categoryId: 2 }),
      row(3, { type: 'income' }),
      row(4, { cancelled: true }),
      row(5, { amountCents: -5 }),
      row(6),
    ]
    expect(buildCells(rows).map((c) => [c.accountId, c.categoryId, c.type, c.cancelled, c.sign])).toEqual([
      [1, 1, 'expense', false, -1],
      [1, 1, 'expense', false, 1],
      [1, 1, 'expense', true, 1],
      [1, 1, 'income', false, 1],
      [1, 2, 'expense', false, 1],
      [2, 1, 'expense', false, 1],
    ])
  })

  it('treats a negative zero as zero', () => {
    expect(buildCells([row(1, { amountCents: -0 })])[0]?.sign).toBe(0)
  })
})

describe('cellRows', () => {
  const accounts: Account[] = [
    { id: 1, name: 'Checking', kind: 'debit', settlement: 'immediate', active: true },
    { id: 3, name: 'Card', kind: 'credit', settlement: 'deferred', active: true },
  ]
  const paid = (paidFlag: boolean): AccountStatement[] => [{ accountId: 3, yearMonth: '2025-03', paid: paidFlag }]
  const cells = buildCells([
    row(1, { accountId: 1 }),
    row(2, { accountId: 3 }),
    row(3, { accountId: 3, cancelled: true }),
    row(4, { accountId: 9 }),
  ])

  it('makes one row per cell with a negative id, no description and the first day of the month', () => {
    const rows = cellRows(cells, accounts, paid(true))
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => r.id)).toEqual([-1, -2, -3, -4])
    for (const r of rows) {
      expect(r).toMatchObject({ description: '', date: '2025-03-01', budgetMonth: '2025-03', labelIds: [] })
      expect(isCellRow(r)).toBe(true)
    }
    expect(isCellRow(makeTransaction({ id: 7 }))).toBe(false)
  })

  it('derives status from the account and the statements as they are now', () => {
    const statusOf = (statements: AccountStatement[]) => cellRows(cells, accounts, statements).map((r) => r.status)
    expect(statusOf(paid(true))).toEqual(['posted', 'posted', 'cancelled', 'posted'])
    expect(statusOf(paid(false))).toEqual(['posted', 'forecast', 'cancelled', 'posted'])
  })

  it('carries the summed amount', () => {
    const [only] = cellRows(buildCells([row(1, { amountCents: 100 }), row(2, { amountCents: 50 })]), accounts, [])
    expect(only?.amountCents).toBe(150)
  })
})
