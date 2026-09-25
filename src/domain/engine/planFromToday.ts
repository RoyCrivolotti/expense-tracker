import type { GoalScenario } from '../types'
import { rebaseline } from './rebaselinePatch'
import { yearOffsetFromDate } from './wealthTracking'

export interface PlanFromToday {
  /** The plan restarted from the check-in: the same assumptions, its balance and date as the start. */
  scenario: GoalScenario
  /** Where the check-in sits on the plan's own axis, in years from the plan start. */
  offsetYears: number
  /** The check-in's date, which the restarted plan counts its years from. */
  since: string
}

/**
 * The plan as it stands from the latest check-in, without touching the plan. The plan line
 * answers whether the plan was right, which ahead or behind measures and a re-baseline
 * would erase; this answers what happens now: the same assumptions projected from the
 * balance actually there, with life events and the house purchase kept on their dates and
 * the contribution grown for the years passed, exactly as a re-baseline would write them.
 * Never saved, so it cannot go stale at the next check-in. Null without a dated plan, or a
 * check-in before its start.
 */
export function planFromToday(
  plan: GoalScenario | null,
  latest: { investedCents: number; date: string } | null,
): PlanFromToday | null {
  if (!plan?.planStartDate || !latest) return null
  const offsetYears = yearOffsetFromDate(plan.planStartDate, latest.date)
  if (offsetYears === null || offsetYears < 0) return null
  return { scenario: { ...plan, ...rebaseline(plan, latest).patch }, offsetYears, since: latest.date }
}
