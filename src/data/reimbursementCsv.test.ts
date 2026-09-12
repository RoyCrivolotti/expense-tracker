import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, Transaction } from '../types'
import { EU_MONEY_FORMAT } from '../engine/money'
import { makeAttachment, makeDataset, makeFlag } from '../testing/factories'
import { downloadReimbursementCsv, reimbursementCsv } from './reimbursementCsv'

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

describe('reimbursementCsv', () => {
  it('writes a header, one row per transaction, and a total', () => {
    const csv = reimbursementCsv(
      datasetWith([txn(1, '2026-05-02', { flagId: 1 }), txn(2, '2026-05-04', { flagId: 1 })]),
      1,
      options,
    )

    const lines = csv!.split('\n')
    expect(lines[0]).toBe('Date,Description,Category,Account,Amount,Receipts')
    expect(lines).toHaveLength(4)
    expect(lines[3]).toContain('Total')
  })

  it('counts receipts per row', () => {
    const csv = reimbursementCsv(
      datasetWith([txn(1, '2026-05-02', { flagId: 1 })], [
        makeAttachment({ id: 1, transactionId: 1 }),
        makeAttachment({ id: 2, transactionId: 1 }),
      ] as never),
      1,
      options,
    )

    expect(csv!.split('\n')[1]).toMatch(/,2$/)
  })

  it('writes a refund negative, so it does not read as another expense', () => {
    const csv = reimbursementCsv(
      datasetWith([txn(1, '2026-05-02', { flagId: 1, type: 'refund', amountCents: 4_000 })]),
      1,
      options,
    )

    expect(csv!.split('\n')[1]).toContain('-40,00')
  })

  it('quotes a description containing a comma', () => {
    const csv = reimbursementCsv(
      datasetWith([txn(1, '2026-05-02', { flagId: 1, description: 'Hotel, Madrid' })]),
      1,
      options,
    )

    expect(csv!.split('\n')[1]).toContain('"Hotel, Madrid"')
  })

  it('escapes an embedded quote by doubling it', () => {
    const csv = reimbursementCsv(
      datasetWith([txn(1, '2026-05-02', { flagId: 1, description: 'The "Grand" Hotel' })]),
      1,
      options,
    )

    expect(csv!.split('\n')[1]).toContain('"The ""Grand"" Hotel"')
  })

  it('falls back to the category when a transaction has no description', () => {
    const csv = reimbursementCsv(
      datasetWith([txn(1, '2026-05-02', { flagId: 1, description: '' })]),
      1,
      options,
    )

    expect(csv!.split('\n')[1]).toContain('Travel,Travel')
  })

  it('is null for a flag with nothing to claim', () => {
    expect(reimbursementCsv(datasetWith([]), 1, options)).toBeNull()
  })

  it('totals the same figure as the pack', () => {
    const csv = reimbursementCsv(
      datasetWith([
        txn(1, '2026-05-02', { flagId: 1, amountCents: 10_000 }),
        txn(2, '2026-05-04', { flagId: 1, amountCents: 4_000, type: 'refund' }),
      ]),
      1,
      options,
    )

    expect(csv!.split('\n').at(-1)).toContain('60,00')
  })
})

describe('downloadReimbursementCsv', () => {
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

    downloadReimbursementCsv(dataset, flagId, options)

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

    expect(anchor.download).toBe('work-travel-q2-2026.csv')
    expect(click).toHaveBeenCalled()
  })

  it('falls back to a usable name when the flag name has no usable characters', () => {
    const dataset = makeDataset({
      flags: [makeFlag({ id: 1, name: '—' })],
      transactions: [txn(1, '2026-05-02', { flagId: 1 })],
    })
    const { anchor } = captureDownload(dataset, 1)

    expect(anchor.download).toBe('claim.csv')
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
