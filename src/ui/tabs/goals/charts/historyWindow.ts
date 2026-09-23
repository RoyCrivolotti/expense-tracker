import { shiftBudgetMonth, shortMonthYearLabel } from '../../../../engine'
import { WINDOW_OPTIONS, stepMonthsFor, type WindowKey } from './checkinWindow'

/**
 * A calendar axis for what has already happened, as opposed to `checkinWindow`, which
 * lays the plan out forward from its start. This one ends today and looks back, so a
 * check-in logged this morning sits on the right edge rather than past it.
 */

const DAY_MS = 86_400_000
const DAYS_PER_MONTH = 365.25 / 12

function utcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d)
}

/** Months from one date to another, counted in days, so the day of a check-in places it. */
export function monthsBetweenDates(from: string, to: string): number {
  return (utcMs(to) - utcMs(from)) / DAY_MS / DAYS_PER_MONTH
}

/** The smallest window that reaches back to the earliest check-in, with a month to spare. */
export function defaultHistoryWindow(earliestDate: string | null, today: string): WindowKey {
  if (!earliestDate) return '1y'
  const wanted = (monthsBetweenDates(earliestDate, today) + 1) / 12
  return WINDOW_OPTIONS.find((o) => o.years != null && o.years >= wanted)?.value ?? 'all'
}

export interface HistoryAxis {
  /** Months in one step; the axis has `steps` of them, the last one ending today. */
  stepMonths: number
  steps: number
  /** Axis label per step, blanked where the axis would crowd. */
  labels: string[]
  /** Full label per step, for the tooltip title. */
  titles: string[]
}

/**
 * The axis for `window`, ending today. 'all' reaches back to the earliest check-in and
 * never shows less than a year, so a single old reading does not fill the plot.
 * `maxLabels` is how many month labels the axis has room for.
 */
export function historyAxis(
  window: WindowKey,
  earliestDate: string | null,
  today: string,
  maxLabels = 5,
): HistoryAxis {
  const years = WINDOW_OPTIONS.find((o) => o.value === window)?.years ?? null
  const months =
    years != null
      ? years * 12
      : Math.max(12, Math.ceil(monthsBetweenDates(earliestDate ?? today, today)) + 1)
  const stepMonths = stepMonthsFor(months / 12)
  const steps = Math.ceil(months / stepMonths)
  const todayMonth = today.slice(0, 7)
  const titles: string[] = []
  for (let i = 0; i <= steps; i++) {
    titles.push(shortMonthYearLabel(shiftBudgetMonth(todayMonth, -(steps - i) * stepMonths)))
  }
  // The last label always, as the plan chart does.
  const every = Math.max(1, Math.ceil(steps / Math.max(1, maxLabels - 1)))
  const labels = titles.map((t, i) => (i % every === 0 || i === steps ? t : ''))
  return { stepMonths, steps, labels, titles }
}

/** Where a date falls on the axis: `steps` is today, and each step back is `stepMonths`. */
export function xIndexFor(date: string, today: string, axis: HistoryAxis): number {
  return axis.steps - monthsBetweenDates(date, today) / axis.stepMonths
}
