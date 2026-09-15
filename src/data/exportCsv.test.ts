import { describe, expect, it } from 'vitest'
import type { ExpenseDataset, Transaction } from '../types'
import { makeDataset } from '../testing/factories'
import { parseExportCsv } from '../domain/data/parseExportCsv'
import { exportTransactionsCsv } from './exportCsv'

function txn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 1,
    date: '2026-05-02',
    budgetMonth: '2026-05',
    description: 'Mercadona',
    accountId: 1,
    categoryId: 1,
    type: 'expense',
    amountCents: 10_000,
    cancelled: false,
    status: 'posted',
    ...overrides,
  }
}

function datasetWith(transactions: Transaction[]): ExpenseDataset {
  return makeDataset({
    categories: [{ id: 1, name: 'Groceries', monthlyBudgetCents: 50_000, sortOrder: 0, active: true }],
    accounts: [{ id: 1, name: 'Main Debit', kind: 'debit', settlement: 'immediate', active: true }],
    transactions,
  })
}

function body(csv: string): string[] {
  return csv.split('\n').slice(1)
}

describe('exportTransactionsCsv — formula injection', () => {
  it.each(['=cmd', '+1+1', '-50% at Zara', '@SUM(A1)'])('guards a description starting %j', (description) => {
    const csv = exportTransactionsCsv(datasetWith([txn({ description })]))

    expect(body(csv)[0]).toContain(`'${description}`)
  })

  it('leaves the amount column numeric', () => {
    // The amount is written unquoted and unguarded; prefixing it would turn the
    // column a spreadsheet sums into text.
    const csv = exportTransactionsCsv(datasetWith([txn({ amountCents: -2_500 })]))

    expect(csv).not.toContain(`'-`)
    expect(body(csv)[0]).toContain('-2500')
  })
})

describe('export → import round trip', () => {
  it('restores a description that had to be guarded', () => {
    const dataset = datasetWith([txn({ description: '=HYPERLINK("http://x")' })])

    const parsed = parseExportCsv(exportTransactionsCsv(dataset), dataset)

    expect(parsed.errors).toEqual([])
    expect(parsed.rows[0]!.input.description).toBe('=HYPERLINK("http://x")')
  })

  it('still resolves a category whose name had to be guarded', () => {
    // resolveName matches on the exact name, so an un-reversed guard would make an
    // exported row fail to import back into the dataset it came from.
    const dataset = makeDataset({
      categories: [{ id: 1, name: '=Travel', monthlyBudgetCents: 1, sortOrder: 0, active: true }],
      accounts: [{ id: 1, name: '-Main', kind: 'debit', settlement: 'immediate', active: true }],
      transactions: [txn()],
    })

    const parsed = parseExportCsv(exportTransactionsCsv(dataset), dataset)

    expect(parsed.errors).toEqual([])
    expect(parsed.rows[0]!.input.categoryId).toBe(1)
    expect(parsed.rows[0]!.input.accountId).toBe(1)
  })

  it('round-trips notes and an ordinary description untouched', () => {
    const dataset = datasetWith([txn({ description: 'Mercadona', notes: 'weekly shop' })])

    const parsed = parseExportCsv(exportTransactionsCsv(dataset), dataset)

    expect(parsed.rows[0]!.input.description).toBe('Mercadona')
    expect(parsed.rows[0]!.input.notes).toBe('weekly shop')
  })
})
