import { addDaysIso, daysBetween, lastDayOfBudgetMonth, shiftBudgetMonth } from './dates'
import type { RecurringFrequency } from './recurringTypes'

const DAY_TOLERANCE = 2

export function median(nums: number[]): number {
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

/** The share of a series' gaps that must lie near the median for the series to count as regular. */
export const MIN_REGULARITY = 0.6

/**
 * The rhythm of a series the fixed-spend split trusts, from the days between its consecutive dates (in any
 * order: only their spread counts), or null when it is not regular enough to call its members fixed. Weekly
 * rhythm is a habit, not an obligation: weekly groceries are exactly the spending the pace clock exists to watch.
 */
export function fixedRhythmFromGaps(gaps: number[]): Exclude<RecurringFrequency, 'weekly'> | null {
  if (gaps.length === 0) return null
  const frequency = classifyFrequency(median(gaps))
  if (!frequency || frequency === 'weekly') return null
  return regularityScore(gaps) >= MIN_REGULARITY ? frequency : null
}

/**
 * How many of a series' newest occurrences say where it lands next. Older ones describe a
 * billing day it has since left, and a median over all of them keeps predicting the old day
 * until the new one outnumbers it.
 */
export const PREDICT_HISTORY = 3

/** How many of a series' newest occurrences say how early it can land. */
export const WINDOW_HISTORY = 5

/** A reminder shows this many days before the usual date at the least. */
const BASE_LEAD_DAYS = 1

/**
 * The most a series' earliness can add to that. Past this a reminder is mostly noise: an
 * erratic series is better shown late than every day of the month.
 */
const MAX_EARLY_DAYS = 4

/**
 * Where in the month a monthly series usually lands: a day of the month, and a few days before
 * or after it. Kept as two numbers so a charge that moves between the 30th and the 1st has one
 * usual day, two days before the 1st, and not a median of 30, 27 and 1.
 */
export interface UsualDay {
  anchor: number
  /** Days from the anchor day; negative for before it. */
  shift: number
}

/** Calendar date of the anchor day in `yearMonth`, clamped to a short month. */
function anchorDate(yearMonth: string, anchor: number): string {
  const lastDay = dayOfMonth(lastDayOfBudgetMonth(yearMonth))
  return `${yearMonth}-${String(Math.min(anchor, lastDay)).padStart(2, '0')}`
}

/**
 * Signed days from the anchor day to `iso`, measured from whichever month's anchor date is
 * nearest, so the 1st and the 30th are two days apart rather than twenty-nine.
 */
function daysFromAnchor(iso: string, anchor: number): number {
  const month = iso.slice(0, 7)
  let nearest = Infinity
  for (const delta of [-1, 0, 1]) {
    const offset = daysBetween(anchorDate(shiftBudgetMonth(month, delta), anchor), iso)
    if (Math.abs(offset) < Math.abs(nearest)) nearest = offset
  }
  return nearest
}

/**
 * The usual day of a monthly series, from its newest occurrences (sorted ascending). The anchor
 * is the most central of them, not simply the newest, so one odd charge (an adjustment in the
 * middle of the month) cannot pull the usual day half a month towards itself.
 */
export function usualDay(sortedDates: string[]): UsualDay {
  const newest = sortedDates.slice(-PREDICT_HISTORY)
  let best: { anchor: number; shifts: number[]; spread: number } | null = null
  for (const date of [...newest].reverse()) {
    const anchor = dayOfMonth(date)
    const shifts = newest.map((d) => daysFromAnchor(d, anchor))
    const spread = shifts.reduce((sum, shift) => sum + Math.abs(shift), 0)
    if (!best || spread < best.spread) best = { anchor, shifts, spread }
  }
  return { anchor: best!.anchor, shift: Math.round(median(best!.shifts)) }
}

/** The date a series with this usual day lands on in `yearMonth`. */
export function usualDate(yearMonth: string, usual: UsualDay): string {
  return addDaysIso(anchorDate(yearMonth, usual.anchor), usual.shift)
}

/** Signed days from the usual date nearest to `iso` to `iso`; negative when it came early. */
function daysFromUsual(iso: string, usual: UsualDay): number {
  const month = iso.slice(0, 7)
  let nearest = Infinity
  for (const delta of [-1, 0, 1]) {
    const offset = daysBetween(usualDate(shiftBudgetMonth(month, delta), usual), iso)
    if (Math.abs(offset) < Math.abs(nearest)) nearest = offset
  }
  return nearest
}

/**
 * Days before the usual date that a reminder starts to show: a day's notice, plus how early the
 * newest charges have landed, up to a cap.
 */
export function leadFromHistory(sortedDates: string[], usual: UsualDay): number {
  const early = Math.max(
    0,
    ...sortedDates.slice(-WINDOW_HISTORY).map((d) => -daysFromUsual(d, usual)),
  )
  return BASE_LEAD_DAYS + Math.min(MAX_EARLY_DAYS, early)
}
