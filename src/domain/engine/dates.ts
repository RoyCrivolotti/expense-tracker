/**
 * Date and budget-month helpers. The source data uses two notions of time:
 * a calendar date ("23 Oct 2025") and a manually-assigned budget month
 * ("January"). New entries default their budget month from the date using the
 * owner's configurable rollover day, but imported rows keep their explicit
 * budget month.
 */

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/**
 * Rollover day used when a user has no explicit preference. 1 means budget
 * months equal plain calendar months (no mid-month rollover).
 */
export const DEFAULT_BUDGET_ROLLOVER_DAY = 1

/** Parse "23 Oct 2025" / "1 Jan 2026" into an ISO date string YYYY-MM-DD. */
export function parseHumanDate(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/)
  if (!match) return null
  const day = Number(match[1])
  const monthIdx = MONTHS.indexOf(match[2]!.slice(0, 3).toLowerCase() as (typeof MONTHS)[number])
  const year = Number(match[3])
  if (monthIdx < 0) return null
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Map a budget-month name ("January") plus a year to YYYY-MM. */
export function budgetMonthFromName(name: string, year: number): string | null {
  const idx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === name.trim().toLowerCase())
  if (idx < 0) return null
  return `${year}-${String(idx + 1).padStart(2, '0')}`
}

/** Short month label ("Jan") from a YYYY-MM string. */
export function shortMonthLabel(yearMonth: string): string {
  const month = Number(yearMonth.split('-')[1])
  const label = MONTH_NAMES[month - 1]
  return label ? label.slice(0, 3) : yearMonth
}

/** Full month label ("January 2026") from a YYYY-MM string. */
export function fullMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  const name = MONTH_NAMES[(month ?? 1) - 1]
  return name ? `${name} ${year}` : yearMonth
}

/**
 * Default budget month for a new transaction dated `isoDate`. Spending on or
 * after `rolloverDay` counts towards next month's budget; a rollover day of 1
 * keeps the budget month equal to the calendar month.
 */
export function defaultBudgetMonth(
  isoDate: string,
  rolloverDay: number = DEFAULT_BUDGET_ROLLOVER_DAY,
): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  let y = year ?? 0
  let m = month ?? 1
  if (rolloverDay > 1 && (day ?? 1) >= rolloverDay) {
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return `${y}-${String(m).padStart(2, '0')}`
}

/** Validate YYYY-MM-DD and return it when the calendar date exists. */
export function parseIsoDate(raw: string): string | null {
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return raw
}

/** Ascending list of distinct budget months present in a set of YYYY-MM values. */
export function sortedMonths(months: Iterable<string>): string[] {
  return Array.from(new Set(months)).sort((a, b) => a.localeCompare(b))
}

/** Budget month immediately before `yearMonth`, e.g. 2026-01 → 2025-12. */
export function priorBudgetMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  let py = y ?? 0
  let pm = (m ?? 1) - 1
  if (pm < 1) {
    pm = 12
    py -= 1
  }
  return `${py}-${String(pm).padStart(2, '0')}`
}

/** ISO date of the last calendar day in a budget month (YYYY-MM). */
export function lastDayOfBudgetMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number) as [number, number]
  const maxDay = new Date(y, m, 0).getDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(maxDay).padStart(2, '0')}`
}

function firstDayOfBudgetMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number) as [number, number]
  return `${y}-${String(m).padStart(2, '0')}-01`
}

/** Budget month `delta` months away from `yearMonth` (negative shifts back). */
export function shiftBudgetMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number) as [number, number]
  let month = m + delta
  let year = y
  while (month > 12) {
    month -= 12
    year += 1
  }
  while (month < 1) {
    month += 12
    year -= 1
  }
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Whole-month distance from `a` to `b` (b - a), e.g. 2026-01 → 2026-03 = 2. */
export function monthsBetweenBudget(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number) as [number, number]
  const [by, bm] = b.split('-').map(Number) as [number, number]
  return (by - ay) * 12 + (bm - am)
}

/** Whole-day distance from `a` to `b` (b - a), positive when `b` is later. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number) as [number, number, number]
  const [by, bm, bd] = b.split('-').map(Number) as [number, number, number]
  const diffMs = new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()
  return Math.round(diffMs / 86_400_000)
}

/** True when `dateIso` is overdue, today, or within `aheadDays` of `todayIso`. */
export function isDueSoon(dateIso: string, todayIso: string, aheadDays = 1): boolean {
  return daysBetween(todayIso, dateIso) <= aheadDays
}

/** Inclusive calendar range covering the last `count` budget months ending at `yearMonth`. */
export function calendarRangeLastMonths(
  yearMonth: string,
  count: number,
): { dateFrom: string; dateTo: string } {
  const startMonth = shiftBudgetMonth(yearMonth, -(count - 1))
  return {
    dateFrom: firstDayOfBudgetMonth(startMonth),
    dateTo: lastDayOfBudgetMonth(yearMonth),
  }
}
