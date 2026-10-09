import { dateAtYears, shortMonthFullYearLabel } from '../../../engine'

/**
 * Financial independence as a month, "around Jan 2042", from a plan's start date and the fractional years at which it
 * is reached. Given for a plan and its restart from a check-in, whose years are counted from two different starts, so
 * that the two can be put side by side. Null without a start date, or when it is not reached or already there.
 */
export function fiAround(startDate: string | null | undefined, exactYears: number | null): string | null {
  if (!startDate || exactYears === null || exactYears <= 0) return null
  return `around ${shortMonthFullYearLabel(dateAtYears(startDate, exactYears).slice(0, 7))}`
}
