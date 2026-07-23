/**
 * Section parsers for the Numbers CSV export. The file concatenates several
 * sheets; here we extract the settings-derived facts (categories, accounts,
 * opening balances, goal inputs) and the deferred-card statement paid flags.
 * Transactions and final assembly live in parseWorkbookCsv.ts.
 */
import type {
  Account,
  AccountStatement,
  CashActual,
  Category,
  ExpenseSettings,
  GoalInputs,
} from '../types'
import { parseEuroToCents, parsePercentToFraction } from '../engine/money'
import { defaultExpenseSettings } from '../engine/defaults'

/** The source workbook tracks a single calendar year. */
export const WORKBOOK_YEAR = 2026

const MONTH_ABBR: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

export function splitLine(line: string): string[] {
  return line.split(';').map((f) => f.trim().replace(/^"|"$/g, ''))
}

function findValue(rows: string[][], label: string): string | null {
  for (const fields of rows) {
    const idx = fields.indexOf(label)
    if (idx >= 0 && idx + 1 < fields.length) return fields[idx + 1] ?? null
  }
  return null
}

function parseNumber(raw: string | null): number {
  if (!raw) return 0
  const value = Number(raw.replace(/%/g, '').replace(/\./g, '').replace(',', '.').trim())
  return Number.isNaN(value) ? 0 : value
}

export function parseSettings(rows: string[][]): ExpenseSettings {
  return {
    ...defaultExpenseSettings(),
    openingCashCents: parseEuroToCents(findValue(rows, 'Opening cash balance (1 Jan)') ?? '0'),
    openingInvestmentCents: parseEuroToCents(
      findValue(rows, 'Opening investment balance (1 Jan)') ?? '0',
    ),
    liquidNetWorthCents: parseEuroToCents(
      findValue(rows, 'Total liquid net worth EUR (calc)') ?? '0',
    ),
    defaultAccountId: null,
  }
}

export function parseGoalInputs(rows: string[][]): GoalInputs {
  return {
    housePriceCents: parseEuroToCents(findValue(rows, 'House target price (BCN)') ?? '0'),
    downPaymentFraction: parsePercentToFraction(findValue(rows, 'Down payment %') ?? '0'),
    mortgageTermYears: parseNumber(findValue(rows, 'Mortgage term (years)')),
    mortgageRateAnnual: parsePercentToFraction(
      findValue(rows, 'Mortgage rate (annual, est)') ?? '0',
    ),
    longTermTargetCents: parseEuroToCents(findValue(rows, 'Long-term savings target') ?? '0'),
    horizonYears: parseNumber(findValue(rows, 'Time horizon (years)')),
    expectedRealReturn: parsePercentToFraction(
      findValue(rows, 'Expected real return on portfolio') ?? '0',
    ),
  }
}

export function parseCategories(rows: string[][]): Category[] {
  const start = rows.findIndex((f) => f[0] === 'Category' && f[1] === 'Monthly Budget')
  if (start < 0) return []
  const categories: Category[] = []
  for (let i = start + 1; i < rows.length; i++) {
    const fields = rows[i]!
    const name = fields[0]
    if (!name || name === 'Total') break
    categories.push({
      id: categories.length + 1,
      name,
      monthlyBudgetCents: parseEuroToCents(fields[1] ?? '0'),
      sortOrder: categories.length,
      active: true,
    })
  }
  return categories
}

export function parseAccounts(rows: string[][]): Account[] {
  const start = rows.findIndex((f) => f[0] === 'Accounts')
  if (start < 0) return []
  const accounts: Account[] = []
  for (let i = start + 1; i < rows.length; i++) {
    const name = rows[i]![0]
    if (!name) break
    const immediate = /debit/i.test(name)
    accounts.push({
      id: accounts.length + 1,
      name,
      kind: immediate ? 'debit' : 'credit',
      settlement: immediate ? 'immediate' : 'deferred',
      active: true,
    })
  }
  return accounts
}

/** Statement paid flags from the Cash Reconciliation sheet (Iberia + SC cards). */
export function parseStatements(rows: string[][], accounts: Account[]): AccountStatement[] {
  const start = rows.findIndex((f) => f[0] === 'Month' && f[1] === 'Iberia Paid?')
  if (start < 0) return []
  const iberia = accounts.find((a) => /iberia/i.test(a.name))
  const credit = accounts.find((a) => /credit/i.test(a.name))
  const statements: AccountStatement[] = []
  for (let i = start + 1; i < rows.length; i++) {
    const fields = rows[i]!
    const month = MONTH_ABBR[(fields[0] ?? '').slice(0, 3).toLowerCase()]
    if (!month) break
    const yearMonth = `${WORKBOOK_YEAR}-${String(month).padStart(2, '0')}`
    if (iberia) statements.push({ accountId: iberia.id, yearMonth, paid: fields[1] === 'TRUE' })
    if (credit) statements.push({ accountId: credit.id, yearMonth, paid: fields[2] === 'TRUE' })
  }
  return statements
}

/** Recorded actual-cash balances from the Cash Reconciliation sheet (col 10). */
export function parseCashActuals(rows: string[][]): CashActual[] {
  const start = rows.findIndex((f) => f[0] === 'Month' && f[1] === 'Iberia Paid?')
  if (start < 0) return []
  const actuals: CashActual[] = []
  for (let i = start + 1; i < rows.length; i++) {
    const fields = rows[i]!
    const month = MONTH_ABBR[(fields[0] ?? '').slice(0, 3).toLowerCase()]
    if (!month) break
    const cents = parseEuroToCents(fields[10] ?? '0')
    if (cents !== 0) {
      actuals.push({
        yearMonth: `${WORKBOOK_YEAR}-${String(month).padStart(2, '0')}`,
        actualCashCents: cents,
      })
    }
  }
  return actuals
}
