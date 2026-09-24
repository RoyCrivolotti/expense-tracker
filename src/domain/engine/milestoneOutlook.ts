/**
 * When the plan says a milestone will be crossed, and how that sits against the date the
 * owner set for it. Projection points are yearly, so the crossing is interpolated within
 * the year it happens in, then placed on the calendar from the plan's start date.
 */
import type { GoalScenario, Milestone } from '../types'
import { DAY_MS, utcDateMs } from './dates'
import { projectNetWorth } from './projection'
import { scenarioToParams } from './scenarioProjection'

const YEAR_DAYS = 365.25

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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Today's date in the local calendar, as the check-in form records it. */
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The calendar date the plan crosses the amount, or null without a start date or within the horizon. */
export function milestoneCrossingDate(plan: GoalScenario, amountCents: number): string | null {
  // A start date only the API could have written malformed must not take Progress down.
  if (!plan.planStartDate || !ISO_DATE.test(plan.planStartDate)) return null
  const years = yearsToAmount(plan, amountCents)
  if (years === null) return null
  // Whole years by the calendar, so two years from 1 January is 1 January; only the part
  // year inside the crossing year is counted in days.
  const whole = Math.floor(years)
  const start = new Date(utcDateMs(plan.planStartDate))
  start.setUTCFullYear(start.getUTCFullYear() + whole)
  return isoAt(start.getTime() + Math.round((years - whole) * YEAR_DAYS) * DAY_MS)
}

export type MilestoneStanding =
  | { kind: 'reached'; on: string }
  | { kind: 'on-track'; expected: string; target: string }
  | { kind: 'late'; expected: string; target: string; monthsLate: number }
  /** The plan had it crossed by a date now past, and no check-in has reached it. */
  | { kind: 'overdue'; expected: string; target: string | null }
  | { kind: 'expected'; expected: string }
  | { kind: 'beyond-horizon'; target: string | null }
  | { kind: 'unknown' }

/**
 * One line's worth of standing for a milestone: reached (by a check-in), on track or late
 * for its target date, expected on a date with no target, overdue when the plan's own date
 * has passed without a check-in reaching it, past the horizon, or unknown when the plan
 * cannot be dated. "On track" is the plan's word, not the portfolio's: once the plan's
 * date is behind us the check-ins have the say, and none has reached it.
 */
export function milestoneStanding(
  milestone: Milestone,
  plan: GoalScenario | null,
  reachedOn: string | undefined,
  today = localToday(),
): MilestoneStanding {
  if (reachedOn) return { kind: 'reached', on: reachedOn }
  if (!plan?.planStartDate) return { kind: 'unknown' }
  const expected = milestoneCrossingDate(plan, milestone.amountCents)
  const target = milestone.targetDate ?? null
  if (!expected) return { kind: 'beyond-horizon', target }
  if (expected < today) return { kind: 'overdue', expected, target }
  if (!target) return { kind: 'expected', expected }
  const lateMs = utcDateMs(expected) - utcDateMs(target)
  if (lateMs <= 0) return { kind: 'on-track', expected, target }
  return { kind: 'late', expected, target, monthsLate: Math.max(1, Math.round(lateMs / DAY_MS / (YEAR_DAYS / 12))) }
}
