/**
 * The Overview's five headline numbers — income, spent, net saved, savings rate,
 * invested — for a period, with a comparison baseline. An open month is only
 * compared with the same days of other months (see `sameDaysLimit`); the savings
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
  sameDaysLimit,
  signedExpense,
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

/** Totals for a set of budget months, each cut at `dayLimit` (null = whole months). */
export function totalsForMonths(
  transactions: Transaction[],
  months: string[],
  dayLimit: number | null,
  basis: AnalyticsBasis,
): OverviewTotals {
  const opts = basisOptions(basis)
  const wanted = new Set(months)
  const t = emptyTotals()
  for (const txn of transactions) {
    if (!wanted.has(txn.budgetMonth)) continue
    if (dayLimit !== null && parseInt(txn.date.slice(8, 10), 10) > dayLimit) continue
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
  dayLimit: number | null,
  basis: AnalyticsBasis,
): OverviewTotals | null {
  const idx = months.indexOf(month)
  if (compare === 'prevMonth') {
    // A viewed month missing from the data (navigated past the edge) still has
    // a meaningful "month before": the newest month below it.
    const prev = idx > 0 ? months[idx - 1] : idx === -1 ? months.filter((m) => m < month).at(-1) : undefined
    return prev ? totalsForMonths(transactions, [prev], dayLimit, basis) : null
  }
  if (compare === 'prevYear') {
    const target = shiftBudgetMonth(month, -12)
    if (!months.includes(target)) return null
    return totalsForMonths(transactions, [target], dayLimit, basis)
  }
  const window = (idx === -1 ? months.filter((m) => m < month) : months.slice(0, idx)).slice(-3)
  return meanTotals(window.map((m) => totalsForMonths(transactions, [m], dayLimit, basis)))
}

/** The preceding window of the same length, for YTD and last-12 baselines. */
function windowBaseline(
  transactions: Transaction[],
  months: string[],
  window: string[],
  basis: AnalyticsBasis,
): OverviewTotals | null {
  const first = window[0]
  if (!first) return null
  const prior = window.map((m) => shiftBudgetMonth(m, -window.length))
  if (!prior.every((m) => months.includes(m))) return null
  return totalsForMonths(transactions, prior, null, basis)
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
}

export function computeOverviewKpis(
  transactions: Transaction[],
  { months, month, period, compare, basis, today, openMonth }: OverviewKpisOptions,
): OverviewKpis {
  const window = monthsForPeriod(months, month, period)
  // The same-days clamp applies to the single-month period; a window period sums
  // whole months. The open month then contributes only what it has so far while
  // the baseline window is whole months — a known skew the chips inherit.
  const openDayLimit = period === 'month' ? sameDaysLimit(month, today, openMonth) : null
  const current = totalsForMonths(transactions, window, openDayLimit, basis)
  const baseline =
    period === 'month'
      ? monthBaseline(transactions, months, month, compare, openDayLimit, basis)
      : windowBaseline(transactions, months, window, basis)
  const sparkMonths = months.filter((m) => m <= month).slice(-12)
  const series = sparkMonths.map((m) => ({
    month: m,
    totals: totalsForMonths(transactions, [m], null, basis),
  }))
  return { current, baseline, openDayLimit, series }
}
