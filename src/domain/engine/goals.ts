import type { MonthlyTotals } from './monthlyTotals'

/** Mean of a list of monthly amounts, rounded to a cent; zero for no months. */
export function averageMonthlyCents(centsByMonth: number[]): number {
  if (centsByMonth.length === 0) return 0
  const total = centsByMonth.reduce((sum, v) => sum + v, 0)
  return Math.round(total / centsByMonth.length)
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
