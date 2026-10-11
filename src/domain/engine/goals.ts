import { shiftBudgetMonth } from './dates'
import type { MonthlyTotals } from './monthlyTotals'

/** Mean of a list of monthly amounts, rounded to a cent; zero for no months. */
export function averageMonthlyCents(centsByMonth: number[]): number {
  if (centsByMonth.length === 0) return 0
  const total = centsByMonth.reduce((sum, v) => sum + v, 0)
  return Math.round(total / centsByMonth.length)
}

/**
 * The middle month: what a typical month looks like once a one-off lump sum, which the
 * mean carries for every month after it, is set aside. No threshold to pick, unlike
 * dropping "outliers", and a lump sum is still in the mean, where it belongs. Zero for
 * no months; the mean of the two middle months when their number is even.
 */
export function medianMonthlyCents(centsByMonth: number[]): number {
  if (centsByMonth.length === 0) return 0
  const sorted = [...centsByMonth].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
}

/**
 * One month of the two flows a plan cares about: what was left after expenses, and
 * what actually went into the portfolio. They differ by whatever stayed in the
 * current account, which is why the pace of a plan is judged on the second. Money taken
 * back out is not counted against it: a sale to cash is the return line's business.
 */
export interface MonthlyFlow {
  month: string
  netSavingCents: number
  investedCents: number
}

/** The flows per budget month, oldest first. */
export function monthlyFlows(totals: Map<string, MonthlyTotals>): MonthlyFlow[] {
  return [...totals.values()]
    .map((t) => ({ month: t.month, netSavingCents: t.netSavingCents, investedCents: t.contributionsCents }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * The months a plan has been in force: from its start month on. A plan with no start
 * date, or one that started after the last recorded month, has nothing of its own to
 * be judged by yet, so every month counts.
 */
export function monthsSincePlanStart(
  flows: MonthlyFlow[],
  planStartDate: string | null,
): MonthlyFlow[] {
  if (!planStartDate) return flows
  const startMonth = planStartDate.slice(0, 7)
  const since = flows.filter((f) => f.month >= startMonth)
  return since.length > 0 ? since : flows
}

/** The months a pace is judged on, and whether they are the plan's own. */
export interface PaceMonths {
  /** Whole months, oldest first, with a month in which nothing was invested as a month of 0. */
  months: MonthlyFlow[]
  /** True when they run from the plan's start month, so "since the plan started" is what they are. */
  sincePlanStart: boolean
}

/**
 * The months the pace kept is judged on. The month still under way is left out, as it is for the
 * cash reserve: someone who invests on the 25th reads 833 against 1.000 until then, however well
 * they are keeping to the plan. A month inside the record with no transactions at all counts as a
 * month of nothing invested, where the flows alone would skip it and flatter the average. Months
 * before the first one recorded are unknown rather than empty, so they are not counted. Nothing
 * when the plan started after the last whole month: there is no pace to judge yet.
 */
export function paceMonths(
  flows: MonthlyFlow[],
  planStartDate: string | null,
  openMonth: string | undefined,
): PaceMonths {
  const closed = openMonth === undefined ? flows : flows.filter((f) => f.month < openMonth)
  const first = closed[0]
  if (!first) return { months: [], sincePlanStart: planStartDate !== null }
  const startMonth = planStartDate ? planStartDate.slice(0, 7) : null
  const from = startMonth !== null && startMonth > first.month ? startMonth : first.month
  const last = closed[closed.length - 1]!.month
  const sincePlanStart = startMonth !== null && startMonth >= first.month
  if (from > last) return { months: [], sincePlanStart: true }
  const recorded = new Map(closed.map((f) => [f.month, f]))
  const months: MonthlyFlow[] = []
  for (let month = from; month <= last; month = shiftBudgetMonth(month, 1)) {
    months.push(recorded.get(month) ?? { month, netSavingCents: 0, investedCents: 0 })
  }
  return { months, sincePlanStart }
}
