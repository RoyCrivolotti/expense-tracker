/**
 * Actual-vs-plan wealth tracking engine.
 *
 * Given a scenario (with planStartDate) and historical check-ins, computes:
 *   - The projected invested-portfolio value at any calendar date.
 *   - An on/off-track status: delta in € and in equivalent months.
 */
import { projectNetWorth } from './projection'
import { scenarioToParams } from './scenarioProjection'
import type { GoalScenario, WealthAccount, WealthCheckin } from '../types'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface TrackStatus {
  /** Projected invested-only value at the check-in date (cents). */
  projectedInvestedCents: number
  /** Actual total of investment-kind accounts in the check-in (cents). */
  actualInvestedCents: number
  /** delta = actual − projected; positive = ahead, negative = behind. */
  deltaCents: number
  /**
   * Months ahead (positive) or behind (negative) of the projection slope.
   * Computed as delta / monthly-contribution, clamped to ±horizonYears×12.
   */
  deltaMonths: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse a YYYY-MM-DD string into a fractional year offset from planStartDate.
 * Returns null if either date is missing or malformed.
 */
export function yearOffsetFromDate(planStartDate: string, targetDate: string): number | null {
  if (!planStartDate?.match(/^\d{4}-\d{2}-\d{2}$/) || !targetDate?.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return null
  }
  const start = new Date(planStartDate).getTime()
  const target = new Date(targetDate).getTime()
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000
  const offset = (target - start) / msPerYear
  return offset
}

/**
 * Interpolate the projected invested-portfolio value at a fractional year offset.
 * Uses linear interpolation between the two surrounding integer year points.
 * Returns null when the offset is outside the projection horizon.
 */
export function planValueAtOffset(
  points: { year: number; investedCents: number }[],
  fractionalYear: number,
): number | null {
  if (points.length === 0) return null

  const floor = Math.floor(fractionalYear)
  const ceil = Math.ceil(fractionalYear)

  if (fractionalYear < 0) {
    // Before plan start — extrapolate backwards using year 0 and year 1.
    const p0 = points.find((p) => p.year === 0)
    const p1 = points.find((p) => p.year === 1)
    if (!p0 || !p1) return null
    const slope = p1.investedCents - p0.investedCents
    return Math.round(p0.investedCents + fractionalYear * slope)
  }

  const pFloor = points.find((p) => p.year === floor)
  const pCeil = points.find((p) => p.year === ceil)

  if (!pFloor) return null
  if (floor === ceil || !pCeil) return pFloor.investedCents

  const frac = fractionalYear - floor
  return Math.round(pFloor.investedCents + frac * (pCeil.investedCents - pFloor.investedCents))
}

/**
 * Compute the projected invested-portfolio value (cents) at a calendar date
 * for a given scenario.  Returns null when planStartDate is not set on the
 * scenario or the date is unparseable.
 */
export function planValueAtDate(scenario: GoalScenario, date: string): number | null {
  if (!scenario.planStartDate) return null
  const offset = yearOffsetFromDate(scenario.planStartDate, date)
  if (offset === null) return null
  const params = scenarioToParams(scenario)
  const points = projectNetWorth(params)
  return planValueAtOffset(points, offset)
}

/**
 * Sum investment-kind account values in a check-in (cents).
 */
export function checkinInvestedCents(
  checkin: WealthCheckin,
  accounts: WealthAccount[],
): number {
  const investmentIds = new Set(
    accounts.filter((a) => a.kind === 'investment').map((a) => a.id),
  )
  return checkin.entries
    .filter((e) => investmentIds.has(e.accountId))
    .reduce((sum, e) => sum + e.valueCents, 0)
}

/**
 * Sum total net worth across all accounts in a check-in (cents).
 * Debt accounts are subtracted; all others are added.
 */
export function checkinNetWorthCents(
  checkin: WealthCheckin,
  accounts: WealthAccount[],
): number {
  const accountMap = new Map(accounts.map((a) => [a.id, a]))
  return checkin.entries.reduce((sum, e) => {
    const account = accountMap.get(e.accountId)
    if (!account) return sum
    return sum + (account.kind === 'debt' ? -e.valueCents : e.valueCents)
  }, 0)
}

/**
 * Compute on/off-track status for a check-in against a scenario.
 * Returns null when the scenario has no planStartDate or the date is invalid.
 */
export function trackStatus(
  checkin: WealthCheckin,
  scenario: GoalScenario,
  accounts: WealthAccount[],
): TrackStatus | null {
  if (!scenario.planStartDate) return null
  const projected = planValueAtDate(scenario, checkin.checkinDate)
  if (projected === null) return null

  const actualInvestedCents = checkinInvestedCents(checkin, accounts)
  const deltaCents = actualInvestedCents - projected

  // Monthly contribution at the check-in's year (approximate using year 1 value).
  const monthlyContrib = scenario.monthlyContributionCents
  const monthlyDivisor = monthlyContrib > 0 ? monthlyContrib : 1
  const maxMonths = Math.round(scenario.horizonYears * 12)
  const rawDeltaMonths = deltaCents / monthlyDivisor
  const deltaMonths = Math.max(-maxMonths, Math.min(maxMonths, Math.round(rawDeltaMonths)))

  return {
    projectedInvestedCents: projected,
    actualInvestedCents,
    deltaCents,
    deltaMonths,
  }
}

/**
 * Most-recent check-in for a given set of check-ins, or null when empty.
 */
export function latestCheckin(checkins: WealthCheckin[]): WealthCheckin | null {
  if (checkins.length === 0) return null
  return checkins.reduce((best, c) =>
    c.checkinDate > best.checkinDate ? c : best,
  )
}
