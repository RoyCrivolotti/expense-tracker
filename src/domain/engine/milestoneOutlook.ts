/**
 * When the plan says a milestone will be crossed, and how that sits against the date the
 * owner set for it. Projection points are yearly, so the crossing is interpolated within
 * the year it happens in, then placed on the calendar from the plan's start date.
 */
import type { GoalScenario, Milestone } from '../types'
import { projectNetWorth } from './projection'
import { scenarioToParams } from './scenarioProjection'

const DAY_MS = 86_400_000
const YEAR_DAYS = 365.25

function utcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d)
}

function isoAt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** The fractional year, from the plan start, at which the invested line first reaches the amount. */
export function yearsToAmount(plan: GoalScenario, amountCents: number): number | null {
  const points = projectNetWorth(scenarioToParams(plan))
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    if (p.investedCents < amountCents) continue
    if (i === 0) return 0
    const prev = points[i - 1]!
    const span = p.investedCents - prev.investedCents
    const frac = span > 0 ? (amountCents - prev.investedCents) / span : 0
    return prev.year + frac
  }
  return null
}

/** The calendar date the plan crosses the amount, or null without a start date or within the horizon. */
export function milestoneCrossingDate(plan: GoalScenario, amountCents: number): string | null {
  if (!plan.planStartDate) return null
  const years = yearsToAmount(plan, amountCents)
  if (years === null) return null
  // Whole years by the calendar, so two years from 1 January is 1 January; only the part
  // year inside the crossing year is counted in days.
  const whole = Math.floor(years)
  const start = new Date(utcMs(plan.planStartDate))
  start.setUTCFullYear(start.getUTCFullYear() + whole)
  return isoAt(start.getTime() + Math.round((years - whole) * YEAR_DAYS) * DAY_MS)
}

export type MilestoneStanding =
  | { kind: 'reached'; on: string }
  | { kind: 'on-track'; expected: string; target: string }
  | { kind: 'late'; expected: string; target: string; monthsLate: number }
  | { kind: 'expected'; expected: string }
  | { kind: 'beyond-horizon'; target: string | null }
  | { kind: 'unknown' }

/**
 * One line's worth of standing for a milestone: reached (by a check-in), on track or late
 * for its target date, expected on a date with no target, past the horizon, or unknown
 * when the plan cannot be dated.
 */
export function milestoneStanding(
  milestone: Milestone,
  plan: GoalScenario | null,
  reachedOn: string | undefined,
): MilestoneStanding {
  if (reachedOn) return { kind: 'reached', on: reachedOn }
  if (!plan?.planStartDate) return { kind: 'unknown' }
  const expected = milestoneCrossingDate(plan, milestone.amountCents)
  const target = milestone.targetDate ?? null
  if (!expected) return { kind: 'beyond-horizon', target }
  if (!target) return { kind: 'expected', expected }
  const lateMs = utcMs(expected) - utcMs(target)
  if (lateMs <= 0) return { kind: 'on-track', expected, target }
  return { kind: 'late', expected, target, monthsLate: Math.max(1, Math.round(lateMs / DAY_MS / (YEAR_DAYS / 12))) }
}
