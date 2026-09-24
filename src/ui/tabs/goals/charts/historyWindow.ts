import { shiftBudgetMonth, shortMonthYearLabel } from '../../../../engine'
import { stepMonthsFor } from './checkinWindow'

/**
 * A calendar axis for what has already happened, as opposed to `checkinWindow`, which
 * lays the plan out forward from its start. This one ends today and looks back.
 *
 * Its windows start shorter than the plan chart's: check-ins arrive a month apart, so a
 * new user has two months of them, and a year-long axis squeezes those into one corner.
 */
export type HistoryWindowKey = '3m' | '6m' | '1y' | '2y' | '5y' | 'all'

export const HISTORY_WINDOWS: { value: HistoryWindowKey; label: string; months: number | null }[] = [
  { value: '3m', label: '3M', months: 3 },
  { value: '6m', label: '6M', months: 6 },
  { value: '1y', label: '1Y', months: 12 },
  { value: '2y', label: '2Y', months: 24 },
  { value: '5y', label: '5Y', months: 60 },
  { value: 'all', label: 'All', months: null },
]

/** 'All' never shows less than this, so a single old reading does not fill the plot. */
const MIN_ALL_MONTHS = 3

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
export function defaultHistoryWindow(earliestDate: string | null, today: string): HistoryWindowKey {
  if (!earliestDate) return '3m'
  const wanted = monthsBetweenDates(earliestDate, today) + 1
  return HISTORY_WINDOWS.find((o) => o.months != null && o.months >= wanted)?.value ?? 'all'
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
 * The axis for `window`, ending today. 'all' reaches back to the earliest check-in.
 * `maxLabels` is how many month labels the axis has room for.
 */
export function historyAxis(
  window: HistoryWindowKey,
  earliestDate: string | null,
  today: string,
  maxLabels = 5,
): HistoryAxis {
  const fixed = HISTORY_WINDOWS.find((o) => o.value === window)?.months ?? null
  const months =
    fixed ?? Math.max(MIN_ALL_MONTHS, Math.ceil(monthsBetweenDates(earliestDate ?? today, today)) + 1)
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
