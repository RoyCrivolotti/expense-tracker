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
  /** The inflation the restart was counted at: spending, rent and the rest are in the euros of `since` by it. */
  inflationRate: number
  /** What it was made from, so it can be made again at another rate (a preview of the Nominal view). */
  source: { plan: GoalScenario; latest: { investedCents: number; date: string } }
}

/**
 * The plan as it stands from the latest check-in, without touching the plan. The plan line
 * answers whether the plan was right, which ahead or behind measures and a re-baseline
 * would erase; this answers what happens now: the same assumptions projected from the
 * balance actually there, with life events and the house purchase kept on their dates, spending,
 * rent, fees, event amounts and the house price in the euros of the check-in (`rebaseline`), and
 * the monthly amount in force at the check-in and the changes still to come, exactly as a
 * re-baseline would write them. The scenario is in the euros of the check-in's day, not of the
 * plan's start, which is what its `offsetYears` is for when it is drawn on the plan's axis.
 * Never saved, so it cannot go stale at the next check-in. Null without a dated plan, or a
 * check-in before its start.
 */
export function planFromToday(
  plan: GoalScenario | null,
  latest: { investedCents: number; date: string } | null,
  inflationRate: number,
): PlanFromToday | null {
  if (!plan?.planStartDate || !latest) return null
  const offsetYears = yearOffsetFromDate(plan.planStartDate, latest.date)
  if (offsetYears === null || offsetYears < 0) return null
  return {
    scenario: { ...plan, ...rebaseline(plan, latest, inflationRate).patch },
    offsetYears,
    since: latest.date,
    inflationRate,
    source: { plan, latest },
  }
}

/** The same restart counted at another inflation rate; itself when the rate is the one it was made at. */
export function planFromTodayAt(fromToday: PlanFromToday, inflationRate: number): PlanFromToday {
  if (inflationRate === fromToday.inflationRate) return fromToday
  return planFromToday(fromToday.source.plan, fromToday.source.latest, inflationRate) ?? fromToday
}
