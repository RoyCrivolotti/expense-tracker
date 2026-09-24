import { describe, expect, it } from 'vitest'
import { EXPORT_CSV_HEADER } from './exportCsvFormat'
import { parseExportCsv } from './parseExportCsv'
import type { ExpenseDataset } from '../types'
import { defaultExpenseSettings } from '../engine'

const DATASET: ExpenseDataset = {
  flags: [],
  attachments: [],
  categories: [
    { id: 1, name: 'Groceries', monthlyBudgetCents: 50000, sortOrder: 0, active: true },
  ],
  accounts: [
    { id: 2, name: 'Santander Debit', kind: 'debit', settlement: 'immediate', active: true },
  ],
  transactions: [],
  accountStatements: [],
  cashActuals: [],
  goalScenarios: [],
  installmentPlans: [],
  wealthAccounts: [],
  wealthCheckins: [],
  settings: defaultExpenseSettings(),
}

const VALID_ROW =
  '1,2026-06-15,2026-06,Mercadona,Groceries,Santander Debit,expense,1250,posted,0,'

describe('parseExportCsv', () => {
  it('parses a valid export row', () => {
    const { rows, errors } = parseExportCsv(`${EXPORT_CSV_HEADER}\n${VALID_ROW}`, DATASET)
    expect(errors).toHaveLength(0)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.input).toMatchObject({
      date: '2026-06-15',
      budgetMonth: '2026-06',
      description: 'Mercadona',
      categoryId: 1,
      accountId: 2,
      type: 'expense',
      amountCents: 1250,
      cancelled: false,
    })
  })

  it('rejects unknown category', () => {
    const header =
      'id,date,budget_month,description,category,account,type,amount_cents,status,cancelled,notes'
    const row =
      '1,2026-06-15,2026-06,Test,Unknown,Santander Debit,expense,100,posted,0,'
    const { rows, errors } = parseExportCsv(`${header}\n${row}`, DATASET)
    expect(rows).toHaveLength(0)
    expect(errors[0]?.message).toContain('Unknown category')
  })

  it('refuses a negative amount on anything but an investment, naming the line', () => {
    const rows = [
      '1,2026-06-15,2026-06,Ok,Groceries,Santander Debit,expense,1250,posted,0,',
      '2,2026-06-16,2026-06,Bad,Groceries,Santander Debit,expense,-500,posted,0,',
      '3,2026-06-17,2026-06,Bad refund,Groceries,Santander Debit,refund,-500,posted,0,',
    ]
    const { rows: parsed, errors } = parseExportCsv(`${EXPORT_CSV_HEADER}\n${rows.join('\n')}`, DATASET)
    expect(parsed).toHaveLength(1)
    // Lines count the header as line 1, so these are the file's own lines.
    expect(errors).toEqual([
      { line: 3, message: 'Amounts must be positive, except a withdrawal from an investment' },
      { line: 4, message: 'Amounts must be positive, except a withdrawal from an investment' },
    ])
  })

  it('accepts a negative investment, which is a withdrawal', () => {
    const row = '1,2026-06-15,2026-06,Sold,Groceries,Santander Debit,investment,-500000,posted,0,'
    const { rows, errors } = parseExportCsv(`${EXPORT_CSV_HEADER}\n${row}`, DATASET)
    expect(errors).toHaveLength(0)
    expect(rows[0]?.input).toMatchObject({ type: 'investment', amountCents: -500_000 })
  })

  it('refuses a fraction of a cent, naming the line', () => {
    const row = '1,2026-06-15,2026-06,Odd,Groceries,Santander Debit,expense,12.5,posted,0,'
    const { rows, errors } = parseExportCsv(`${EXPORT_CSV_HEADER}\n${row}`, DATASET)
    expect(rows).toHaveLength(0)
    expect(errors).toEqual([{ line: 2, message: 'Amount must be a whole number of cents' }])
  })

  it('skips zero-amount rows', () => {
    const header =
      'id,date,budget_month,description,category,account,type,amount_cents,status,cancelled,notes'
    const row = '1,2026-06-15,2026-06,,Groceries,Santander Debit,expense,0,forecast,0,'
    const { rows, errors } = parseExportCsv(`${header}\n${row}`, DATASET)
    expect(rows).toHaveLength(0)
    expect(errors[0]?.message).toContain('zero')
  })

  it('handles quoted descriptions with commas', () => {
    const header =
      'id,date,budget_month,description,category,account,type,amount_cents,status,cancelled,notes'
    const row =
      '1,2026-06-15,2026-06,"Shop, sale",Groceries,Santander Debit,expense,500,posted,0,'
    const { rows } = parseExportCsv(`${header}\n${row}`, DATASET)
    expect(rows[0]?.input.description).toBe('Shop, sale')
  })
})
