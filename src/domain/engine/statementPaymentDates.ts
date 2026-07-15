import type { Account } from '../types'

function nextBudgetMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number) as [number, number]
  let month = m + 1
  let year = y
  if (month > 12) {
    month = 1
    year += 1
  }
  return `${year}-${String(month).padStart(2, '0')}`
}

function addCalendarDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isoDay(yearMonth: string, day: number): string {
  const [y, m] = yearMonth.split('-').map(Number) as [number, number]
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function isIberiaCard(account: Account): boolean {
  return account.settlement === 'deferred' && /iberia/i.test(account.name)
}

export function isSantanderCreditCard(account: Account): boolean {
  if (account.settlement !== 'deferred' || isIberiaCard(account)) return false
  return /credit|\bsc\b/i.test(account.name)
}

/** Iberia extract lands ~13th of the month after the budget month; debit follows 2 days later. */
export function inferIberiaPaidOn(budgetMonth: string): string {
  const extractMonth = nextBudgetMonth(budgetMonth)
  return addCalendarDays(isoDay(extractMonth, 13), 2)
}

/** Santander credit liquidación: 1st of the calendar month after the budget month. */
export function inferSantanderCreditPaidOn(budgetMonth: string): string {
  return `${nextBudgetMonth(budgetMonth)}-01`
}

/** Default for other deferred cards: mid-month of the calendar month after budget. */
export function inferGenericDeferredPaidOn(budgetMonth: string): string {
  return isoDay(nextBudgetMonth(budgetMonth), 15)
}

/** Estimated debit date for a paid deferred-card statement (backfill only). */
export function inferStatementPaidOn(account: Account, budgetMonth: string): string {
  if (isIberiaCard(account)) return inferIberiaPaidOn(budgetMonth)
  if (isSantanderCreditCard(account)) return inferSantanderCreditPaidOn(budgetMonth)
  return inferGenericDeferredPaidOn(budgetMonth)
}

export interface BackfillStatementRow {
  accountId: number
  yearMonth: string
  paid: boolean
  paidOn?: string
  account: Account
}

/** Rows needing a one-time paid_on write (NULL only, deferred, paid). */
export function computeBackfillUpdates(
  rows: BackfillStatementRow[],
): Array<{ accountId: number; yearMonth: string; paidOn: string }> {
  return rows
    .filter((r) => r.paid && !r.paidOn && r.account.settlement === 'deferred')
    .map((r) => ({
      accountId: r.accountId,
      yearMonth: r.yearMonth,
      paidOn: inferStatementPaidOn(r.account, r.yearMonth),
    }))
}
