import type { RecurringFrequency } from './recurringTypes'

const DAY_TOLERANCE = 2

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

function dayOfMonth(iso: string): number {
  return Number(iso.split('-')[2])
}

/** Classify a median gap (in days) into a frequency bucket, or null if irregular. */
export function classifyFrequency(medianGap: number): RecurringFrequency | null {
  if (medianGap >= 5 && medianGap <= 9) return 'weekly'
  if (medianGap >= 25 && medianGap <= 37) return 'monthly'
  if (medianGap >= 80 && medianGap <= 105) return 'quarterly'
  if (medianGap >= 340 && medianGap <= 395) return 'yearly'
  return null
}

/** Check regularity: what fraction of gaps fall within tolerance of the median. */
export function regularityScore(gaps: number[]): number {
  if (gaps.length === 0) return 0
  const med = median(gaps)
  const tolerance = Math.max(DAY_TOLERANCE, med * 0.15)
  const inRange = gaps.filter((g) => Math.abs(g - med) <= tolerance).length
  return inRange / gaps.length
}

/** Median day-of-month from historical dates (tolerates weekend drift). */
export function canonicalDayOfMonth(sortedDates: string[]): number {
  return Math.round(median(sortedDates.map(dayOfMonth)))
}

/** Place a monthly recurrence on its typical day within `yearMonth` (YYYY-MM). */
export function predictDateInBudgetMonth(yearMonth: string, sortedDates: string[]): string {
  const [y, m] = yearMonth.split('-').map(Number) as [number, number]
  const maxDay = new Date(y, m, 0).getDate()
  const day = Math.min(canonicalDayOfMonth(sortedDates), maxDay)
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Predict the next occurrence date based on frequency and historical days. */
export function predictNextDate(
  frequency: RecurringFrequency,
  sortedDates: string[],
): string | null {
  const last = sortedDates[sortedDates.length - 1]
  if (!last) return null

  if (frequency === 'weekly') {
    return addDaysIso(last, 7)
  }
  if (frequency === 'monthly') {
    return nextMonthOnDay(last, canonicalDayOfMonth(sortedDates))
  }
  if (frequency === 'quarterly') {
    return addMonthsOnDay(last, 3, canonicalDayOfMonth(sortedDates))
  }
  return addMonthsOnDay(last, 12, canonicalDayOfMonth(sortedDates))
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function nextMonthOnDay(lastIso: string, day: number): string {
  const [y, m] = lastIso.split('-').map(Number) as [number, number]
  let nextMonth = m + 1
  let nextYear = y
  if (nextMonth > 12) {
    nextMonth = 1
    nextYear += 1
  }
  const maxDay = new Date(nextYear, nextMonth, 0).getDate()
  const clampedDay = Math.min(day, maxDay)
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

function addMonthsOnDay(lastIso: string, months: number, day: number): string {
  const [y, m] = lastIso.split('-').map(Number) as [number, number]
  let nextMonth = m + months
  let nextYear = y
  while (nextMonth > 12) {
    nextMonth -= 12
    nextYear += 1
  }
  const maxDay = new Date(nextYear, nextMonth, 0).getDate()
  const clampedDay = Math.min(day, maxDay)
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}
