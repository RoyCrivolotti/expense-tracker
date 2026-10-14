import { addDaysIso, daysBetween, shiftBudgetMonth } from './dates'
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

/**
 * How many of a series' newest occurrences say where it lands next. Older ones describe a
 * billing day it has since left, and a median over all of them keeps predicting the old day
 * until the new one outnumbers it.
 */
export const PREDICT_HISTORY = 3

/** Median day-of-month of the newest occurrences (tolerates weekend drift). */
export function canonicalDayOfMonth(sortedDates: string[]): number {
  return Math.round(median(sortedDates.slice(-PREDICT_HISTORY).map(dayOfMonth)))
}

/** How many of a series' newest occurrences say how early it can land. */
export const WINDOW_HISTORY = 5

/** A suggestion shows this many days before its predicted date at the least. */
const BASE_LEAD_DAYS = 1

/**
 * The most a series' earliness can add to that. Past this a reminder is mostly noise: an
 * erratic series is better shown late than every day of the month.
 */
const MAX_EARLY_DAYS = 4

/** Signed days from `iso` to the nearest occurrence of day-of-month `day` (clamped to short months). */
function daysFromDay(iso: string, day: number): number {
  const yearMonth = iso.slice(0, 7)
  let nearest = Infinity
  for (const shift of [-1, 0, 1]) {
    const month = shiftBudgetMonth(yearMonth, shift)
    const [y, m] = month.split('-').map(Number) as [number, number]
    const clamped = Math.min(day, new Date(y, m, 0).getDate())
    const delta = daysBetween(`${month}-${String(clamped).padStart(2, '0')}`, iso)
    if (Math.abs(delta) < Math.abs(nearest)) nearest = delta
  }
  return nearest
}

/**
 * How many days before the usual day a monthly series has recently turned up. Measured around
 * the nearest occurrence of the day, not as a spread of day-of-month numbers, so a charge billed
 * on the 31st or the 1st is a day apart rather than thirty.
 */
function recentEarlyDays(sortedDates: string[]): number {
  const day = canonicalDayOfMonth(sortedDates)
  return Math.max(0, ...sortedDates.slice(-WINDOW_HISTORY).map((d) => -daysFromDay(d, day)))
}

/**
 * Days before `predictedDate` that a suggestion starts to show: a day's notice, plus for a
 * monthly series how early it has recently landed, up to a cap. A weekly, quarterly or yearly
 * one lands a fixed span after the last, so the day's notice is all it needs.
 */
export function leadDays(frequency: RecurringFrequency, sortedDates: string[]): number {
  if (frequency !== 'monthly') return BASE_LEAD_DAYS
  return BASE_LEAD_DAYS + Math.min(MAX_EARLY_DAYS, recentEarlyDays(sortedDates))
}

/**
 * Calendar date a monthly recurrence falls on for budget month `yearMonth`.
 * `monthOffset` is the group's typical distance from the payment's calendar
 * month to its budget month (learned from history): 0 when the budget month
 * equals the calendar month (most charges, incl. deferred-card charges dated
 * near the rollover), +1 when a late-month payment rolls into the next budget
 * month (e.g. the 20th billed for the August budget is really July 20). The
 * resulting date's own budget month therefore equals `yearMonth`, which the
 * due-soon window relies on.
 */
export function predictDateInBudgetMonth(
  yearMonth: string,
  sortedDates: string[],
  monthOffset: number,
): string {
  const dateMonth = shiftBudgetMonth(yearMonth, -monthOffset)
  const [y, m] = dateMonth.split('-').map(Number) as [number, number]
  const maxDay = new Date(y, m, 0).getDate()
  const clampedDay = Math.min(canonicalDayOfMonth(sortedDates), maxDay)
  return `${dateMonth}-${String(clampedDay).padStart(2, '0')}`
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
