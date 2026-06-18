/**
 * Date and budget-month helpers. The source data uses two notions of time:
 * a calendar date ("23 Oct 2025") and a manually-assigned budget month
 * ("January"). New entries default their budget month from the date with a
 * rollover on the 13th, but imported rows keep their explicit budget month.
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

/** Day-of-month on/after which a transaction rolls into the next budget month. */
export const BUDGET_ROLLOVER_DAY = 13

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
 * after the rollover day counts towards next month's budget.
 */
export function defaultBudgetMonth(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  let y = year ?? 0
  let m = month ?? 1
  if ((day ?? 1) >= BUDGET_ROLLOVER_DAY) {
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return `${y}-${String(m).padStart(2, '0')}`
}

/** Ascending list of distinct budget months present in a set of YYYY-MM values. */
export function sortedMonths(months: Iterable<string>): string[] {
  return Array.from(new Set(months)).sort((a, b) => a.localeCompare(b))
}
