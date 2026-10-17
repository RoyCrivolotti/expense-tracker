import { describe, expect, it } from 'vitest'
import { makeDataset, makeTransaction } from '../../testing/factories'
import { computeMonthlyTotals } from '../engine/monthlyTotals'
import type { Account, AccountStatement, ExpenseDataset, Transaction } from '../types'
import { assembleRows, ledgerDataset, ledgerMonths, ledgerRowCount } from './assemble'
import { buildLedger, ledgerFor } from './build'
import { isCellRow } from './cells'
import { isPinned, partitionPinned, settlementPaymentIds } from './pinned'

const accounts: Account[] = [
  { id: 1, name: 'Checking', kind: 'debit', settlement: 'immediate', active: true },
  { id: 3, name: 'Card', kind: 'credit', settlement: 'deferred', active: true },
]
const statements: AccountStatement[] = [{ accountId: 3, yearMonth: '2025-02', paid: true }]

const row = (id: number, month: string, overrides: Partial<Transaction> = {}): Transaction =>
  makeTransaction({ id, budgetMonth: month, date: `${month}-10`, ...overrides })

/**
 * Written by hand: January has an expense, a refund, a settled expense (id 2) and a pinned investment.
 * February is a paid card month with one cancelled row. March has only a cancelled row, April only a row
 * for nothing and a flagged card charge, and May (hydrated) holds the payment that settled id 2.
 */
const rows: Transaction[] = [
  row(11, '2025-05', { description: 'Payment', type: 'refund', amountCents: 500, reportCount: 1, reportCoveredCents: 500 }),
  row(10, '2025-05', { amountCents: 900 }),
  row(9, '2025-04', { accountId: 3, amountCents: 100, flagId: 1, status: 'forecast' }),
  row(8, '2025-04', { amountCents: 0 }),
  row(7, '2025-03', { amountCents: 400, cancelled: true, status: 'cancelled' }),
  row(6, '2025-02', { accountId: 3, amountCents: 300, cancelled: true, status: 'cancelled' }),
  row(5, '2025-02', { accountId: 3, amountCents: 700 }),
  row(4, '2025-01', { type: 'investment', categoryId: 13, amountCents: 3_000 }),
  row(3, '2025-01', { type: 'refund', amountCents: 200 }),
  row(2, '2025-01', { amountCents: 500, settledBy: 11 }),
  row(1, '2025-01', { amountCents: 1_000 }),
]
const dataset: ExpenseDataset = makeDataset({ accounts, accountStatements: statements, transactions: rows })

describe('pinning', () => {
  it('pins investments and rows tied to a plan, flag or settlement', () => {
    const payments = new Set<number>()
    const pinned = (t: Partial<Transaction>) => isPinned(row(1, '2025-01', t), payments)
    expect(pinned({})).toBe(false)
    expect(pinned({ type: 'investment' })).toBe(true)
    expect(pinned({ type: 'investment', amountCents: -5 })).toBe(true)
    expect(pinned({ planId: 4 })).toBe(true)
    expect(pinned({ flagId: 2 })).toBe(true)
    expect(pinned({ settledBy: 9 })).toBe(true)
    expect(pinned({ reportCount: 2 })).toBe(true)
    expect(pinned({ reportCount: 0 })).toBe(false)
  })

  it('pins the payment another row points at, and nothing else', () => {
    const payments = settlementPaymentIds(rows)
    expect([...payments]).toEqual([11])
    expect(isPinned(row(11, '2025-05'), payments)).toBe(true)
    expect(isPinned(row(12, '2025-05'), payments)).toBe(false)
  })

  it('splits a list without reordering either half', () => {
    const { pinned, rest } = partitionPinned(rows)
    expect(pinned.map((t) => t.id)).toEqual([11, 9, 4, 2])
    expect(rest.map((t) => t.id)).toEqual([10, 8, 7, 6, 5, 3, 1])
  })
})

describe('buildLedger', () => {
  const ledger = buildLedger(dataset, ['2025-05'])

  it('holds the reference data, the pinned rows, the hydrated month and a cell per group', () => {
    expect(ledger.reference.accounts).toBe(accounts)
    expect('transactions' in ledger.reference).toBe(false)
    expect(ledger.pinned.map((t) => t.id)).toEqual([11, 9, 4, 2])
    expect(ledger.hydratedMonths).toEqual(['2025-05'])
    expect(ledger.hydrated.map((t) => t.id)).toEqual([11, 10])
    expect(ledger.cells.map((c) => [c.budgetMonth, c.type, c.cancelled, c.sign, c.amountCents, c.count])).toEqual([
      ['2025-01', 'expense', false, 1, 1_000, 1],
      ['2025-01', 'refund', false, 1, 200, 1],
      ['2025-02', 'expense', false, 1, 700, 1],
      ['2025-02', 'expense', true, 1, 300, 1],
      ['2025-03', 'expense', true, 1, 400, 1],
      ['2025-04', 'expense', false, 0, 0, 1],
    ])
  })

  it('never puts a pinned row in a cell, so an investment is counted once', () => {
    const sum = (list: Transaction[]) => list.filter((t) => t.type === 'investment').reduce((n, t) => n + t.amountCents, 0)
    const { linear } = assembleRows(ledger)
    expect(sum(linear)).toBe(sum(rows))
    expect(ledger.cells.some((c) => c.type === 'investment')).toBe(false)
  })

  it('stands for every row exactly once', () => {
    expect(ledgerRowCount(ledger)).toBe(rows.length)
    expect(ledgerMonths(ledger)).toEqual(['2025-01', '2025-02', '2025-03', '2025-04', '2025-05'])
  })
})

describe('assembleRows', () => {
  const ledger = buildLedger(dataset, ['2025-05'])
  const { linear, real } = assembleRows(ledger)

  it('gives the real rows once each, in the order the API returns them', () => {
    expect(real.map((t) => t.id)).toEqual([11, 10, 9, 4, 2])
  })

  it('adds one row per cell to the linear list, with negative ids and no description', () => {
    const summed = linear.filter(isCellRow)
    expect(summed).toHaveLength(6)
    expect(summed.every((t) => t.description === '' && t.date.endsWith('-01'))).toBe(true)
    expect(linear.filter((t) => !isCellRow(t))).toEqual(real)
    expect(linear.map((t) => t.date)).toEqual([...linear.map((t) => t.date)].sort().reverse())
  })

  it('gives the same monthly totals as the whole ledger, which were worked out by hand', () => {
    const expenses = (list: Transaction[]) =>
      [...computeMonthlyTotals(list).values()]
        .map((m) => [m.month, m.expensesCents, m.contributionsCents])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    const expected = [
      ['2025-01', 1_300, 3_000],
      ['2025-02', 700, 0],
      ['2025-04', 0, 0],
      ['2025-05', 400, 0],
    ]
    expect(expenses(rows)).toEqual(expected)
    expect(expenses(linear)).toEqual(expected)
  })

  it('does not count a cell for a month that is also hydrated', () => {
    const both = { ...ledger, cells: [...ledger.cells, ...buildLedger(dataset, []).cells.filter((c) => c.budgetMonth === '2025-05')] }
    expect(assembleRows(both).linear).toEqual(linear)
    expect(ledgerRowCount(both)).toBe(rows.length)
  })

  it('rebuilds a dataset around either list', () => {
    expect(ledgerDataset(ledger, real)).toEqual({ ...dataset, transactions: real })
  })

  it('derives the status of a cell row from the statements as they stand', () => {
    const unpaid = { ...ledger, reference: { ...ledger.reference, accountStatements: [] } }
    const status = (l: typeof ledger) => assembleRows(l).linear.filter((t) => t.accountId === 3 && isCellRow(t)).map((t) => t.status)
    expect(status(ledger)).toEqual(['posted', 'cancelled'])
    expect(status(unpaid)).toEqual(['forecast', 'cancelled'])
  })
})

describe('the size policy', () => {
  it('hydrates every month of a small ledger and sums nothing, so the lists are the whole dataset', () => {
    const ledger = ledgerFor(dataset, '2025-05')
    expect(ledger.cells).toEqual([])
    expect(ledger.hydratedMonths).toEqual(['2025-01', '2025-02', '2025-03', '2025-04', '2025-05'])
    const { linear, real } = assembleRows(ledger)
    expect(linear).toEqual(rows)
    expect(real).toEqual(rows)
  })

  it('sums the months outside the window once the ledger is over the limit', () => {
    const ledger = ledgerFor(dataset, '2025-05', { fullBelowRows: 3, dataMonths: 2 })
    expect(ledger.hydratedMonths).toEqual(['2025-04', '2025-05'])
    expect(ledger.cells.map((c) => c.budgetMonth)).toEqual(['2025-01', '2025-01', '2025-02', '2025-02', '2025-03'])
    expect(ledgerRowCount(ledger)).toBe(rows.length)
  })

  it('handles a ledger with no rows', () => {
    const ledger = ledgerFor(makeDataset(), '2025-05')
    expect(assembleRows(ledger)).toEqual({ linear: [], real: [] })
    expect(ledgerMonths(ledger)).toEqual([])
    expect(ledgerRowCount(ledger)).toBe(0)
  })
})
