import { describe, expect, it } from 'vitest'
import { EXPORT_CSV_HEADER } from './exportCsvFormat'
import { parseExportCsv } from './parseExportCsv'
import type { ExpenseDataset } from '../types'

const DATASET: ExpenseDataset = {
  categories: [
    { id: 1, name: 'Groceries', monthlyBudgetCents: 50000, sortOrder: 0, active: true },
  ],
  accounts: [
    { id: 2, name: 'Santander Debit', kind: 'debit', settlement: 'immediate', active: true },
  ],
  transactions: [],
  accountStatements: [],
  cashActuals: [],
  goalInputs: {
    housePriceCents: 0,
    downPaymentFraction: 0,
    mortgageTermYears: 0,
    mortgageRateAnnual: 0,
    longTermTargetCents: 0,
    horizonYears: 0,
    expectedRealReturn: 0,
  },
  goalScenarios: [],
  installmentPlans: [],
  settings: {
    openingCashCents: 0,
    openingInvestmentCents: 0,
    liquidNetWorthCents: 0,
    defaultAccountId: null,
  },
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
