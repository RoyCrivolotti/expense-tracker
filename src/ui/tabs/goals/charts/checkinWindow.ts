import { planLineOf, planValueAt, planValueBefore, shiftBudgetMonth, shortMonthYearLabel, type PlanPoint } from '../../../../engine'

/**
 * How much of the plan the Actual vs plan chart shows. A thirty-year projection
 * makes the first year of check-ins a dot in the corner; the window starts where
 * those check-ins are legible and can be widened by hand.
 */
export type WindowKey = '1y' | '2y' | '5y' | '10y' | 'all'

export const WINDOW_OPTIONS: { value: WindowKey; label: string; years: number | null }[] = [
  { value: '1y', label: '1Y', years: 1 },
  { value: '2y', label: '2Y', years: 2 },
  { value: '5y', label: '5Y', years: 5 },
  { value: '10y', label: '10Y', years: 10 },
  { value: 'all', label: 'All', years: null },
]

/** The smallest window with a quarter's headroom past today, so the marker is not on the edge. */
export function defaultWindow(elapsedYears: number): WindowKey {
  const wanted = Math.max(0, elapsedYears) + 0.25
  return WINDOW_OPTIONS.find((o) => o.years != null && o.years >= wanted)?.value ?? 'all'
}

/** Points per year: monthly for short windows, coarser as the window grows. */
export function stepMonthsFor(windowYears: number): number {
  if (windowYears <= 2) return 1
  if (windowYears <= 5) return 3
  if (windowYears <= 10) return 6
  return 12
}

export interface WindowSeries {
  /** Projected invested value at each step. */
  values: number[]
  /**
   * Where a step is an anniversary with a house payment or event, what the plan reached the day
   * before it: the line climbs to this and drops straight to `values`. Absent for a plan with none.
   */
  preStep?: number[]
  /** Axis label per step, blanked where the axis would crowd. */
  labels: string[]
  /** Full label per step, for the tooltip title. */
  titles: string[]
  /** One step, in years, for placing check-ins and today on the same axis. */
  stepYears: number
}

/**
 * Resample the plan's line onto a window of `windowYears` from the plan start, one point every
 * `stepMonths`. The line rises through each year and steps on the anniversary of a house payment
 * or event; every `stepMonths` divides a year, so an anniversary is always a place on the axis.
 */
export function windowSeries(
  points: readonly PlanPoint[],
  planStartDate: string,
  windowYears: number,
  stepMonths: number,
): WindowSeries {
  const startMonth = planStartDate.slice(0, 7)
  const steps = Math.round((windowYears * 12) / stepMonths)
  const line = planLineOf(points)
  const values: number[] = []
  const before: number[] = []
  const titles: string[] = []
  for (let i = 0; i <= steps; i++) {
    const offset = (i * stepMonths) / 12
    const value = planValueAt(line, offset) ?? 0
    values.push(value)
    before.push(planValueBefore(line, offset) ?? value)
    titles.push(shortMonthYearLabel(shiftBudgetMonth(startMonth, i * stepMonths)))
  }
  // About five labels: the end ones are anchored to the plot's edges, and more than
  // that on a phone runs them into each other.
  const every = Math.max(1, Math.ceil(steps / 4))
  const labels = titles.map((t, i) => (i % every === 0 || i === steps ? t : ''))
  const stepped = before.some((v, i) => v !== values[i])
  return { values, ...(stepped ? { preStep: before } : {}), labels, titles, stepYears: stepMonths / 12 }
}
