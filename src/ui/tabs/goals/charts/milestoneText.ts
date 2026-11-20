import { shortMonthYearLabel } from '../../../../engine'
import type { MilestoneRow } from './milestoneModel'

/** The phrases the years-to-milestone table and its timeline both build their sentences from. */

/** "1 year" or "6 years". */
export function yearsText(n: number): string {
  return n === 1 ? '1 year' : `${n} years`
}

/** What a path does not reach: the end of its horizon is `horizonFromNow` years away. */
export function beyondText(row: MilestoneRow, amounts: string): string {
  return `${row.name} does not reach ${amounts} within its horizon (the next ${row.horizonFromNow} years).`
}

/**
 * What a path has at its start. A path that starts after today does not have it yet: it has it on
 * the day it starts, which is what is said, never that it already has it.
 */
export function atStartText(row: MilestoneRow, amounts: string): string {
  if (row.elapsedYears >= 0) return `${row.name} already has ${amounts} at its start.`
  return `${row.name} has ${amounts} when it starts, in ${shortMonthYearLabel(row.startDate.slice(0, 7))}.`
}
