/**
 * A gap that has not moved is a plan problem, not a saving one. When every check-in
 * over the last half year sits about the same distance from the plan, the plan's
 * starting point is what is off, and a re-baseline is the fix rather than more saving.
 */
import type { GoalScenario, WealthAccount, WealthCheckin } from '../types'
import { trackStatus } from './wealthTracking'

const DAY_MS = 86_400_000

export interface SteadyGap {
  /** The earliest check-in in the run. */
  sinceDate: string
  /** Mean of actual minus projected across the run, in cents; negative is behind. */
  meanDeltaCents: number
  count: number
}

function utcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d)
}

/** The check-ins from the last one that is at least `minDays` older than the latest. */
function recentRun(checkins: WealthCheckin[], minDays: number): WealthCheckin[] {
  const sorted = [...checkins].sort((a, b) => a.checkinDate.localeCompare(b.checkinDate))
  const latest = sorted[sorted.length - 1]
  if (!latest) return []
  const latestMs = utcMs(latest.checkinDate)
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (latestMs - utcMs(sorted[i]!.checkinDate) >= minDays * DAY_MS) return sorted.slice(i)
  }
  return []
}

/** Actual minus projected for each check-in, or null if any cannot be measured. */
function gapDeltas(run: WealthCheckin[], plan: GoalScenario, accounts: WealthAccount[]): number[] | null {
  const deltas: number[] = []
  for (const c of run) {
    const status = trackStatus(c, plan, accounts)
    if (!status) return null
    deltas.push(status.deltaCents)
  }
  return deltas
}

/** All on one side of the plan, and none further than `tolerance` of the mean from it. */
function isSteady(deltas: number[], mean: number, tolerance: number): boolean {
  if (mean === 0) return false
  return deltas.every(
    (d) => Math.sign(d) === Math.sign(mean) && Math.abs(d - mean) <= Math.abs(mean) * tolerance,
  )
}

/**
 * Null unless the check-ins reaching back at least `minDays` from the latest one number
 * `minCount` or more, all sit on the same side of the plan, and each is within
 * `tolerance` of their mean gap. The plan needs a start date.
 */
export function steadyGap(
  checkins: WealthCheckin[],
  plan: GoalScenario,
  accounts: WealthAccount[],
  { minDays = 180, minCount = 3, tolerance = 0.25 } = {},
): SteadyGap | null {
  if (!plan.planStartDate) return null
  const run = recentRun(checkins, minDays)
  if (run.length < minCount) return null
  const deltas = gapDeltas(run, plan, accounts)
  if (!deltas) return null
  const mean = deltas.reduce((s, d) => s + d, 0) / deltas.length
  if (!isSteady(deltas, mean, tolerance)) return null
  return { sinceDate: run[0]!.checkinDate, meanDeltaCents: Math.round(mean), count: run.length }
}
