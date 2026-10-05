import type { Transaction } from '../types'
import { addDaysIso, daysBetween, priorBudgetMonth, shiftBudgetMonth } from './dates'

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
 * A like-for-like cut: how many days of a budget month have elapsed. The month
 * under way is only ever compared with the same stretch of other months, never
 * a partial month against a full one. Build it with `sameDaysCut`.
 */
export interface SameDaysCut {
  /** Days of the open budget month that have passed, today included. */
  elapsedDays: number
  /** The owner's rollover day: a budget month starts on this day of the month before. */
  rolloverDay: number
  /** Cutoff date per budget month, filled on demand so the hot loops stay cheap. */
  cutoffs: Map<string, string>
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** First calendar date of a budget month: day 1, or the rollover day of the month before. */
export function budgetMonthStart(month: string, rolloverDay: number = 1): string {
  return rolloverDay > 1 ? `${priorBudgetMonth(month)}-${pad2(rolloverDay)}` : `${month}-01`
}

/** How many calendar days a budget month spans. */
export function budgetMonthLength(month: string, rolloverDay: number = 1): number {
  return daysBetween(budgetMonthStart(month, rolloverDay), budgetMonthStart(shiftBudgetMonth(month, 1), rolloverDay))
}

/**
 * The cut for a month, or null when the month is whole. Only `openMonth` (the
 * budget month `today` falls in, from `defaultBudgetMonth`) is partial: a past
 * month is whole, and a future month shows its whole committed picture rather
 * than a slice of a month that has not begun. Days are counted from the budget
 * month's own first day, so a rollover day of 13 cuts at "day 5 of the month
 * that began on the 13th", not at the 5th of the calendar month.
 */
export function sameDaysCut(
  month: string,
  today: string,
  openMonth: string = today.slice(0, 7),
  rolloverDay: number = 1,
): SameDaysCut | null {
  if (month !== openMonth) return null
  const elapsed = daysBetween(budgetMonthStart(openMonth, rolloverDay), today) + 1
  return {
    elapsedDays: Math.min(Math.max(elapsed, 1), budgetMonthLength(openMonth, rolloverDay)),
    rolloverDay,
    cutoffs: new Map(),
  }
}

/** The same cut applied to another budget month, and whether `date` falls inside it. */
export function withinCut(date: string, month: string, cut: SameDaysCut | null): boolean {
  if (cut === null) return true
  let cutoff = cut.cutoffs.get(month)
  if (cutoff === undefined) {
    cutoff = addDaysIso(budgetMonthStart(month, cut.rolloverDay), cut.elapsedDays - 1)
    cut.cutoffs.set(month, cutoff)
  }
  return date <= cutoff
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

/** Net expense for a budget month through a same-days cut (null = whole month). */
export function spendThroughCut(
  transactions: Transaction[],
  month: string,
  cut: SameDaysCut | null,
  basis: AnalyticsBasis,
): number {
  const opts = basisOptions(basis)
  let total = 0
  for (const txn of transactions) {
    if (txn.budgetMonth !== month) continue
    if (!withinCut(txn.date, month, cut)) continue
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
