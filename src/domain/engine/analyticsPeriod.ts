import type { Transaction } from '../types'

/**
 * Analytics basis — which card charges count. `committed` counts a charge in
 * its budget month whether or not the statement is paid (matching budgets and
 * the Dashboard); `paid` counts it only once the statement is paid (matching
 * cash). Cash reconciliation is inherently paid-basis and offers no choice.
 */
export type AnalyticsBasis = 'committed' | 'paid'

export interface BasisOptions {
  includeForecast: boolean
}

/** The engine options (`computeMonthlyTotals`, `computeCategoryActuals`) for a basis. */
export function basisOptions(basis: AnalyticsBasis): BasisOptions {
  return { includeForecast: basis === 'committed' }
}

/** Period the Overview aggregates over: one budget month, the calendar year to date, or the last twelve months. */
export type AnalyticsPeriod = 'month' | 'ytd' | 'last12'

/** What a number is compared against: the month before, the mean of the three before, or a year earlier. */
export type CompareMode = 'prevMonth' | 'avg3' | 'prevYear'

/** The budget months a period covers, oldest first. `months` is the model's sorted list. */
export function monthsForPeriod(
  months: string[],
  month: string,
  period: AnalyticsPeriod,
): string[] {
  const upTo = months.filter((m) => m <= month)
  if (period === 'month') return upTo.slice(-1)
  if (period === 'ytd') return upTo.filter((m) => m.startsWith(month.slice(0, 4)))
  return upTo.slice(-12)
}

/**
 * Day-of-month cutoff for comparing like with like. The month under way is
 * only ever compared with the same days of other months, never a partial month
 * against a full one. Only `openMonth` — the budget month `today` falls in,
 * rollover-aware via `defaultBudgetMonth` — is open: a past month is whole, and
 * a future month shows its whole committed picture rather than a "first N days"
 * slice of a month that has not begun. The cutoff is today's day-of-month
 * applied to each transaction's own calendar date; with a budget rollover day
 * the window shifts, but day-of-month stays the honest like-for-like cut.
 * Closed months return null (whole month).
 */
export function sameDaysLimit(
  month: string,
  today: string,
  openMonth: string = today.slice(0, 7),
): number | null {
  return month === openMonth ? parseInt(today.slice(8, 10), 10) : null
}

function countsOn(txn: Transaction, opts: BasisOptions): boolean {
  if (txn.status === 'cancelled') return false
  if (!opts.includeForecast && txn.status === 'forecast') return false
  return true
}

/** Signed net-expense cents (expense − refund), or null for other types / excluded statuses. */
export function signedExpense(txn: Transaction, opts: BasisOptions): number | null {
  if (!countsOn(txn, opts)) return null
  if (txn.type === 'expense') return txn.amountCents
  if (txn.type === 'refund') return -txn.amountCents
  return null
}

/** Net expense for a budget month through a day-of-month cutoff (null = whole month). */
export function spendThroughDay(
  transactions: Transaction[],
  month: string,
  day: number | null,
  basis: AnalyticsBasis,
): number {
  const opts = basisOptions(basis)
  let total = 0
  for (const txn of transactions) {
    if (txn.budgetMonth !== month) continue
    if (day !== null && parseInt(txn.date.slice(8, 10), 10) > day) continue
    total += signedExpense(txn, opts) ?? 0
  }
  return total
}

/** Net expense cents still sitting on unpaid card statements for a budget month. */
export function unpaidExpenseCents(transactions: Transaction[], month: string): number {
  let total = 0
  for (const txn of transactions) {
    if (txn.budgetMonth !== month || txn.status !== 'forecast') continue
    if (txn.type === 'expense') total += txn.amountCents
    else if (txn.type === 'refund') total -= txn.amountCents
  }
  return total
}
