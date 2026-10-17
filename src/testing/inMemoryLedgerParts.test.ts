import { describe, expect, it } from 'vitest'
import { buildCells, partitionPinned } from '../domain/ledger'
import { makeAttachment, makeDataset, makeTransaction } from './factories'
import { inMemoryExpenseRepository } from './inMemoryExpenseRepository'
import { ledgerReferenceOf, monthCellsOf, monthRowsOf } from './inMemoryLedgerParts'

const row = (id: number, month: string, over: Parameters<typeof makeTransaction>[0] = {}) =>
  makeTransaction({ id, date: `${month}-10`, budgetMonth: month, ...over })

const dataset = makeDataset({
  transactions: [
    row(1, '2026-01'),
    row(2, '2026-01', { type: 'investment' }),
    row(3, '2026-02', { cancelled: true, status: 'cancelled' }),
    row(4, '2026-02', { amountCents: 0 }),
    row(5, '2026-03', { flagId: 1 }),
    row(6, '2026-03', { settledBy: 7 }),
    row(7, '2026-04', { type: 'refund' }),
    row(8, '2026-04', { labelIds: [3, 1, 2] }),
  ],
  attachments: [makeAttachment({ id: 1, transactionId: 5 }), makeAttachment({ id: 2, transactionId: 5 }), makeAttachment({ id: 3, transactionId: 1 })],
})

describe('ledgerReferenceOf', () => {
  const part = ledgerReferenceOf(dataset)

  it('pins what partitionPinned pins, including the payment a row points at, newest first', () => {
    expect(part.pinned.map((t) => t.id)).toEqual([7, 6, 5, 2])
    expect(part.pinned.map((t) => t.id)).toEqual(partitionPinned(dataset.transactions).pinned.map((t) => t.id).sort((a, b) => b - a))
  })

  it('counts the months that have any row, a month of cancelled rows included', () => {
    expect(part.months).toEqual(['2026-01', '2026-02', '2026-03', '2026-04'])
    expect(part.rowsPerMonth).toEqual({ '2026-01': 2, '2026-02': 2, '2026-03': 2, '2026-04': 2 })
    expect(part.rowCount).toBe(8)
  })

  it('counts receipts of the pinned rows only', () => {
    expect(part.attachmentCounts).toEqual({ 5: 2 })
  })

  it('leaves out the transactions and the receipt list, and keeps every other table', () => {
    expect(Object.keys(part.reference).sort()).toEqual(
      ['accountStatements', 'accounts', 'cashActuals', 'categories', 'flags', 'goalScenarios', 'installmentPlans', 'labels', 'settings', 'wealthAccounts', 'wealthCheckins'].sort(),
    )
  })

  it('is empty for an empty ledger', () => {
    expect(ledgerReferenceOf(makeDataset())).toMatchObject({ pinned: [], months: [], rowsPerMonth: {}, rowCount: 0, attachmentCounts: {} })
  })
})

describe('monthRowsOf', () => {
  it('returns the rows of the range newest first, with label ids ascending and the receipts of those rows', () => {
    const part = monthRowsOf(dataset, { from: '2026-01', to: '2026-04' }, 100)!
    expect(part.transactions.map((t) => t.id)).toEqual([8, 7, 6, 5, 4, 3, 2, 1])
    expect(part.transactions[0]!.labelIds).toEqual([1, 2, 3])
    expect(part.attachmentCounts).toEqual({ 1: 1, 5: 2 })
  })

  it('narrows to the range, ends included', () => {
    expect(monthRowsOf(dataset, { from: '2026-02', to: '2026-03' }, 100)!.transactions.map((t) => t.id)).toEqual([6, 5, 4, 3])
    expect(monthRowsOf(dataset, { from: '2027-01', to: '2027-02' }, 100)!.transactions).toEqual([])
  })

  it('is null when there are more rows than the limit, and not when there are exactly as many', () => {
    expect(monthRowsOf(dataset, { from: '2026-01', to: '2026-04' }, 8)).not.toBeNull()
    expect(monthRowsOf(dataset, { from: '2026-01', to: '2026-04' }, 7)).toBeNull()
  })
})

describe('monthCellsOf', () => {
  it('sums the unpinned rows of the range as buildCells does, leaving the pinned ones out', () => {
    const cells = monthCellsOf(dataset, { from: '2026-01', to: '2026-04' }, 100)!
    expect(cells).toEqual(buildCells([dataset.transactions[0]!, dataset.transactions[2]!, dataset.transactions[3]!, dataset.transactions[7]!]))
    expect(cells.reduce((n, c) => n + c.count, 0)).toBe(4)
  })

  it('is null when there are more cells than the limit', () => {
    expect(monthCellsOf(dataset, { from: '2026-01', to: '2026-04' }, 3)).toBeNull()
    expect(monthCellsOf(dataset, { from: '2026-01', to: '2026-04' }, 4)).not.toBeNull()
  })
})

describe('the in-memory repository', () => {
  it('answers each owner from their own rows', async () => {
    const repo = inMemoryExpenseRepository({ transactions: [row(1, '2026-01')] }, 'a@example.com')
    expect((await repo.readLedgerReference('a@example.com')).months).toEqual(['2026-01'])
    expect((await repo.readLedgerReference('b@example.com'))).toMatchObject({ months: [], rowCount: 0, pinned: [] })
    expect((await repo.readMonthRows('a@example.com', { from: '2026-01', to: '2026-12' }, 10))?.transactions).toHaveLength(1)
    expect(await repo.readMonthCells('b@example.com', { from: '2026-01', to: '2026-01' }, 10)).toEqual([])
  })
})
