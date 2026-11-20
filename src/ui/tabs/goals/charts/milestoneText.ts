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
