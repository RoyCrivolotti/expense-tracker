/**
 * The Overview's five headline numbers: income, spent, net saved, savings rate,
 * invested, for a period, with a comparison baseline. An open month is only
 * compared with the same days of other months (see `sameDaysCut`); the savings
 * rate follows decision 6: (income − spending) ÷ income, investing is not
 * spending, and reimbursable spend counts until it is repaid.
 */
import type { Transaction } from '../types'
import { shiftBudgetMonth } from './dates'
import {
  type AnalyticsBasis,
  type AnalyticsPeriod,
  type CompareMode,
  basisOptions,
  monthsForPeriod,
  type SameDaysCut,
  sameDaysCut,
  signedExpense,
  withinCut,
} from './analyticsPeriod'

export interface OverviewTotals {
  incomeCents: number
  spendCents: number
  savedCents: number
  investedCents: number
  /** savedCents / incomeCents, or null with no income. */
  rate: number | null
}

export interface OverviewKpis {
  current: OverviewTotals
  /** What the chips compare against, or null when history doesn't reach. */
  baseline: OverviewTotals | null
  /** Non-null when the current period ends in the open month: the day both sides were cut at. */
  openDayLimit: number | null
  /** Full months for the tile sparklines, oldest first (up to 12, open month included). */
  series: { month: string; totals: OverviewTotals }[]
}

function emptyTotals(): OverviewTotals {
  return { incomeCents: 0, spendCents: 0, savedCents: 0, investedCents: 0, rate: null }
}

function finishTotals(t: OverviewTotals): OverviewTotals {
  t.savedCents = t.incomeCents - t.spendCents
  t.rate = t.incomeCents > 0 ? t.savedCents / t.incomeCents : null
  return t
}

/**
 * Totals for a set of budget months, each cut like the open month (null = whole
 * months). `cutOnly` limits the cut to one month of a window, so the rest stay whole.
 */
export function totalsForMonths(
  transactions: Transaction[],
  months: string[],
  cut: SameDaysCut | null,
  basis: AnalyticsBasis,
  cutOnly?: string,
): OverviewTotals {
  const opts = basisOptions(basis)
  const wanted = new Set(months)
  const t = emptyTotals()
  for (const txn of transactions) {
    if (!wanted.has(txn.budgetMonth)) continue
    if ((cutOnly === undefined || txn.budgetMonth === cutOnly) && !withinCut(txn.date, txn.budgetMonth, cut))
      continue
    if (txn.status === 'cancelled') continue
    if (!opts.includeForecast && txn.status === 'forecast') continue
    if (txn.type === 'income') t.incomeCents += txn.amountCents
    else if (txn.type === 'investment') t.investedCents += txn.amountCents
    else t.spendCents += signedExpense(txn, opts) ?? 0
  }
  return finishTotals(t)
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : Math.round(values.reduce((s, v) => s + v, 0) / values.length)
}

function meanTotals(parts: OverviewTotals[]): OverviewTotals | null {
  if (parts.length === 0) return null
  return finishTotals({
    incomeCents: mean(parts.map((p) => p.incomeCents)),
    spendCents: mean(parts.map((p) => p.spendCents)),
    savedCents: 0,
    investedCents: mean(parts.map((p) => p.investedCents)),
    rate: null,
  })
}

function monthBaseline(
  transactions: Transaction[],
  months: string[],
  month: string,
  compare: CompareMode,
  cut: SameDaysCut | null,
  basis: AnalyticsBasis,
): OverviewTotals | null {
  const idx = months.indexOf(month)
  if (compare === 'prevMonth') {
    // A viewed month missing from the data (navigated past the edge) still has
    // a meaningful "month before": the newest month below it.
    const prev = idx > 0 ? months[idx - 1] : idx === -1 ? months.filter((m) => m < month).at(-1) : undefined
    return prev ? totalsForMonths(transactions, [prev], cut, basis) : null
  }
  if (compare === 'prevYear') {
    const target = shiftBudgetMonth(month, -12)
    if (!months.includes(target)) return null
    return totalsForMonths(transactions, [target], cut, basis)
  }
  const window = (idx === -1 ? months.filter((m) => m < month) : months.slice(0, idx)).slice(-3)
  return meanTotals(window.map((m) => totalsForMonths(transactions, [m], cut, basis)))
}

/**
 * The same calendar months a year earlier, for YTD and last-12 baselines. Shifting by
 * the window's own length would overlap the window across a gap in the data, and put
 * a year-to-date total beside the wrong season. The open month's counterpart is cut
 * at the same elapsed days, so a half-finished month is not set against a whole one.
 */
function windowBaseline(
  transactions: Transaction[],
  months: string[],
  window: string[],
  cut: SameDaysCut | null,
  openMonth: string,
  basis: AnalyticsBasis,
): OverviewTotals | null {
  if (window.length === 0) return null
  const prior = window.map((m) => shiftBudgetMonth(m, -12))
  if (!prior.every((m) => months.includes(m))) return null
  return totalsForMonths(transactions, prior, cut, basis, shiftBudgetMonth(openMonth, -12))
}

export interface OverviewKpisOptions {
  months: string[]
  month: string
  period: AnalyticsPeriod
  compare: CompareMode
  basis: AnalyticsBasis
  /** ISO date, so the open-month clamp is explicit and testable. */
  today: string
  /** The budget month `today` falls in (rollover-aware); defaults to today's calendar month. */
  openMonth?: string
  /** The owner's budget rollover day; defaults to plain calendar months. */
  rolloverDay?: number
}

export function computeOverviewKpis(
  transactions: Transaction[],
  { months, month, period, compare, basis, today, openMonth, rolloverDay }: OverviewKpisOptions,
): OverviewKpis {
  const window = monthsForPeriod(months, month, period)
  // The open month is only ever the last month of a window, and is compared like
  // for like: the same elapsed days of the month it is set against.
  const cut = sameDaysCut(month, today, openMonth, rolloverDay)
  const openDayLimit = cut?.elapsedDays ?? null
  const current = totalsForMonths(transactions, window, cut, basis, month)
  const baseline =
    period === 'month'
      ? monthBaseline(transactions, months, month, compare, cut, basis)
      : windowBaseline(transactions, months, window, cut, month, basis)
  const sparkMonths = months.filter((m) => m <= month).slice(-12)
  const series = sparkMonths.map((m) => ({
    month: m,
    totals: totalsForMonths(transactions, [m], null, basis),
  }))
  return { current, baseline, openDayLimit, series }
}
