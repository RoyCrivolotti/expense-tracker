import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, Transaction } from '../types'
import { EU_MONEY_FORMAT } from '../engine/money'
import { makeAttachment, makeDataset, makeFlag } from '../testing/factories'
import { downloadExpenseReportCsv, expenseReportCsv } from './expenseReportCsv'
import { buildExpenseReport } from '../domain/engine/expenseReport'

/** The tests speak in datasets; the CSV now takes the assembled report. */
function reportFor(dataset: ExpenseDataset, flagId = 1) {
  return buildExpenseReport(flagId, dataset.transactions, dataset.flags, dataset.attachments)
}

const options = {
  format: EU_MONEY_FORMAT,
  categoryName: (id: number) => (id === 1 ? 'Travel' : 'Other'),
  accountName: () => 'Main Debit',
}

function txn(id: number, date: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    date,
    budgetMonth: date.slice(0, 7),
    description: `Txn ${id}`,
    accountId: 1,
    categoryId: 1,
    type: 'expense',
    amountCents: 10_000,
    cancelled: false,
    status: 'posted',
    ...overrides,
  }
}

function datasetWith(transactions: Transaction[], attachments = []): ExpenseDataset {
  return makeDataset({ flags: [makeFlag({ id: 1, name: 'Work travel' })], transactions, attachments })
}

/**
 * The data rows, found rather than counted from the top: the claim carries a
 * claimant/reference preamble whose height depends on whether a claimant is set,
 * so a fixed index silently reads the wrong line.
 */
function body(csv: string): string[] {
  const lines = csv.split('\n')
  const header = lines.findIndex((l) => l.startsWith('Date,'))
  return lines.slice(header + 1)
}

function headerLine(csv: string): string {
  return csv.split('\n').find((l) => l.startsWith('Date,'))!
}

describe('expenseReportCsv', () => {
  it('writes a header, one row per transaction, and a total', () => {
    const csv = expenseReportCsv(reportFor(datasetWith([txn(1, '2026-05-02', { flagId: 1 }), txn(2, '2026-05-04', { flagId: 1 })])), options)

    expect(headerLine(csv!)).toBe('Date,Description,Purpose,Category,Account,Amount,Receipts')
    const rows = body(csv!)
    expect(rows).toHaveLength(3)
    expect(rows[2]).toContain('Total expenses')
  })

  it('carries the transaction notes through as the business purpose', () => {
    // An approver asks what a dinner was *for*; notes already holds exactly that.
    const csv = expenseReportCsv(reportFor(datasetWith([txn(1, '2026-05-02', { flagId: 1, notes: 'Kick-off with Acme' })])), options)

    expect(body(csv!)[0]).toContain('Kick-off with Acme')
  })

  it('breaks the totals out once a reimbursement has been recorded', () => {
    const csv = expenseReportCsv(reportFor(datasetWith([
        txn(1, '2026-05-02', { flagId: 1, amountCents: 10_000 }),
        txn(2, '2026-06-14', { flagId: 1, amountCents: 4_000, type: 'refund' }),
      ])), options)

    const lines = csv!.split('\n')
    // Claimed stays gross; the credit is negative so the Amount column still
    // sums to the outstanding figure if someone totals it in a spreadsheet.
    expect(lines.at(-3)).toContain('Total expenses')
    expect(lines.at(-2)).toContain('Less reimbursed')
    expect(lines.at(-1)).toContain('Outstanding')
    expect(lines.at(-1)).toContain('60,00')
  })

  it('cross-references receipts per row, so a line ties to a figure', () => {
    const csv = expenseReportCsv(reportFor(datasetWith([txn(1, '2026-05-02', { flagId: 1 })], [
        makeAttachment({ id: 1, transactionId: 1 }),
        makeAttachment({ id: 2, transactionId: 1 }),
      ] as never)), options)

    expect(body(csv!)[0]).toMatch(/,R1 R2$/)
  })

  it('writes a credit negative, so it does not read as another expense', () => {
    const csv = expenseReportCsv(reportFor(datasetWith([
        txn(1, '2026-05-02', { flagId: 1, amountCents: 10_000 }),
        txn(2, '2026-06-14', { flagId: 1, type: 'refund', amountCents: 4_000 }),
      ])), options)

    // The credit follows the claimed lines, so it is row 2.
    expect(body(csv!)[1]).toContain('-40,00')
  })

  it('produces nothing for a flag whose only rows are credits', () => {
    // Expenses cancelled after settling: there is no claim left to print, and
    // the document would carry a dash for a period and a negative total.
    const csv = expenseReportCsv(reportFor(datasetWith([txn(1, '2026-05-02', { flagId: 1, type: 'refund', amountCents: 4_000 })])), options)

    expect(csv).toBeNull()
  })

  it('quotes a description containing a comma', () => {
    const csv = expenseReportCsv(reportFor(datasetWith([txn(1, '2026-05-02', { flagId: 1, description: 'Hotel, Madrid' })])), options)

    expect(body(csv!)[0]).toContain('"Hotel, Madrid"')
  })

  it('escapes an embedded quote by doubling it', () => {
    const csv = expenseReportCsv(reportFor(datasetWith([txn(1, '2026-05-02', { flagId: 1, description: 'The "Grand" Hotel' })])), options)

    expect(body(csv!)[0]).toContain('"The ""Grand"" Hotel"')
  })

  it('falls back to the category when a transaction has no description', () => {
    const csv = expenseReportCsv(reportFor(datasetWith([txn(1, '2026-05-02', { flagId: 1, description: '' })])), options)

    expect(body(csv!)[0]).toContain('Travel,,Travel')
  })

  it('is null for a flag with nothing to claim', () => {
    expect(expenseReportCsv(reportFor(datasetWith([])), options)).toBeNull()
  })

  it('totals the same figure as the report', () => {
    const csv = expenseReportCsv(
      reportFor(
        datasetWith([
          txn(1, '2026-05-02', { flagId: 1, amountCents: 10_000 }),
          txn(2, '2026-05-04', { flagId: 1, amountCents: 4_000, type: 'refund' }),
        ]),
      ),
      options,
    )

    expect(csv!.split('\n').at(-1)).toContain('60,00')
  })
})

describe('downloadExpenseReportCsv', () => {
  function captureDownload(dataset: ExpenseDataset, flagId: number) {
    const created: string[] = []
    const revoked: string[] = []
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => {
        created.push('blob:x')
        return 'blob:x'
      }),
      revokeObjectURL: vi.fn((u: string) => revoked.push(u)),
    })
    const anchor = document.createElement('a')
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => {})
    vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor)

    downloadExpenseReportCsv(reportFor(dataset, flagId), options)

    return { anchor, click, created, revoked }
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('names the file after the flag, slugified', () => {
    const dataset = makeDataset({
      flags: [makeFlag({ id: 1, name: 'Work travel — Q2 2026!' })],
      transactions: [txn(1, '2026-05-02', { flagId: 1 })],
    })
    const { anchor, click } = captureDownload(dataset, 1)

    // Period suffix: without it a second claim on the same flag overwrites the
    // first in Downloads, or lands beside it as work-travel(1).csv.
    expect(anchor.download).toBe('work-travel-q2-2026-2026-05.csv')
    expect(click).toHaveBeenCalled()
  })

  it('falls back to a usable name when the flag name has no usable characters', () => {
    const dataset = makeDataset({
      flags: [makeFlag({ id: 1, name: '—' })],
      transactions: [txn(1, '2026-05-02', { flagId: 1 })],
    })
    const { anchor } = captureDownload(dataset, 1)

    expect(anchor.download).toBe('expense-report-2026-05.csv')
  })

  it('releases the object URL rather than leaking it', () => {
    const dataset = makeDataset({
      flags: [makeFlag({ id: 1, name: 'Work travel' })],
      transactions: [txn(1, '2026-05-02', { flagId: 1 })],
    })
    const { revoked } = captureDownload(dataset, 1)

    expect(revoked).toEqual(['blob:x'])
  })

  it('does nothing at all when there is nothing to claim', () => {
    const dataset = makeDataset({ flags: [makeFlag({ id: 1 })] })
    const { click, created } = captureDownload(dataset, 1)

    expect(click).not.toHaveBeenCalled()
    expect(created).toEqual([])
  })
})
