/**
 * Actual-vs-plan wealth tracking engine.
 *
 * Given a scenario (with planStartDate) and historical check-ins, computes:
 *   - The projected invested-portfolio value at any calendar date.
 *   - An on/off-track status: delta in € and the months it is along the plan's line.
 */
import { dateAtYears, isCalendarDate, yearsBetween } from './dates'
import { measurePlanDistance } from './planDistance'
import { planLineOf, planValueAt } from './planLine'
import { readAgainst } from './planStepWindow'
import { projectNetWorth } from './projection'
import { scenarioToParams } from './scenarioProjection'
import type { GoalScenario, Milestone, WealthAccount, WealthCheckin } from '../types'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface TrackStatus {
  /** Projected invested-only value at the check-in date (cents). */
  projectedInvestedCents: number
  /** Actual total of investment-kind accounts in the check-in (cents). */
  actualInvestedCents: number
  /** delta = actual − projected; positive = ahead, negative = behind. */
  deltaCents: number
  /**
   * Whole months ahead (positive) or behind (negative) of the plan: the distance along the plan's
   * line from the check-in to the point that has this balance (`planDistance`). Null when the
   * line never has it, which `deltaCents` still says.
   */
  deltaMonths: number | null
  /** The day the plan's line has the check-in's balance, in step with `deltaMonths`; null when it is. */
  planDate: string | null
  /** The check-in's balance in the plan's money, which is what `deltaCents` is taken from. */
  actualRealInvestedCents: number
  /**
   * Why there are no months when `deltaMonths` is null: the line has the balance only across a
   * house payment or event (`across-event`), or never (`outside-line`). Null when there are months.
   */
  monthsReason: 'across-event' | 'outside-line' | null
  /** Within a month of the plan either way, along the line; what the dashboard and Progress call on track. */
  onTrack: boolean
  /**
   * Set when the check-in is within a month of an anniversary with a house payment or event and its
   * balance is on the other side of the step from the line: `projectedInvestedCents` is then the plan
   * with the step `made` (the check-in is before it) or `not-made` (after it), not the line on the day.
   */
  nearStep: { date: string; counted: 'made' | 'not-made' } | null
}

/** Against the other side of a step there is no stretch to count months along. */
const ACROSS_STEP = { kind: 'unmeasured', reason: 'across-event' } as const

/** What a status is called: on track, or ahead or behind by the sign of the gap in money. */
export function trackVerdict(status: Pick<TrackStatus, 'onTrack' | 'deltaCents'>): 'on-track' | 'ahead' | 'behind' {
  if (status.onTrack) return 'on-track'
  return status.deltaCents >= 0 ? 'ahead' : 'behind'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * The years from the plan start to a date, counted on the calendar: a whole number on each
 * anniversary, which is where the plan's yearly points and its steps are. Null if either date is
 * missing or malformed.
 */
export function yearOffsetFromDate(planStartDate: string, targetDate: string): number | null {
  if (!isCalendarDate(planStartDate) || !isCalendarDate(targetDate)) return null
  return yearsBetween(planStartDate, targetDate)
}

/** The date a fractional year offset from the plan start falls on, counted as `yearOffsetFromDate` counts. */
export function dateAtOffset(planStartDate: string, offsetYears: number): string {
  return dateAtYears(planStartDate, offsetYears)
}

/**
 * The projected invested-portfolio value at a fractional year offset, on the plan's line: it rises
 * through each year and steps on the anniversary of a house payment or event. Returns null before
 * the plan starts or after its last year, where there is no line.
 */
export function planValueAtOffset(
  points: { year: number; investedCents: number; preEventInvestedCents?: number }[],
  fractionalYear: number,
): number | null {
  if (points.length === 0) return null
  return planValueAt(planLineOf(points), fractionalYear)
}

/**
 * Compute the projected invested-portfolio value (cents) at a calendar date
 * for a given scenario.  Returns null when planStartDate is not set on the
 * scenario or the date is unparseable.
 */
export function planValueAtDate(scenario: GoalScenario, date: string, inflationRate: number): number | null {
  if (!scenario.planStartDate) return null
  const offset = yearOffsetFromDate(scenario.planStartDate, date)
  if (offset === null) return null
  const params = scenarioToParams(scenario, inflationRate)
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

/** Sum of everything owned in a check-in (cents): every account that is not a debt. */
export function checkinAssetsCents(checkin: WealthCheckin, accounts: WealthAccount[]): number {
  const debtIds = new Set(accounts.filter((a) => a.kind === 'debt').map((a) => a.id))
  const known = new Set(accounts.map((a) => a.id))
  return checkin.entries
    .filter((e) => known.has(e.accountId) && !debtIds.has(e.accountId))
    .reduce((sum, e) => sum + e.valueCents, 0)
}

/** Whether any check-in records a balance against a debt account. */
export function hasDebtEntries(checkins: WealthCheckin[], accounts: WealthAccount[]): boolean {
  const debtIds = new Set(accounts.filter((a) => a.kind === 'debt').map((a) => a.id))
  if (debtIds.size === 0) return false
  return checkins.some((c) => c.entries.some((e) => debtIds.has(e.accountId) && e.valueCents !== 0))
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
 * A broker balance brought to the plan's money. The plan is real, in the money of its
 * start date; a check-in is nominal, in the money of its own day, so the years between
 * the two are taken off at the assumed inflation before the balance is set against the
 * plan line. The reverse puts a real figure into the money of a later day.
 */
export function nominalToReal(
  cents: number,
  planStartDate: string,
  date: string,
  inflationRate: number,
): number {
  const years = yearOffsetFromDate(planStartDate, date) ?? 0
  return Math.round(cents / Math.pow(1 + inflationRate, Math.max(0, years)))
}

export function realToNominal(
  cents: number,
  planStartDate: string,
  date: string,
  inflationRate: number,
): number {
  const years = yearOffsetFromDate(planStartDate, date) ?? 0
  return Math.round(cents * Math.pow(1 + inflationRate, Math.max(0, years)))
}

/**
 * Compute on/off-track status for a check-in against a scenario.
 * Returns null when the scenario has no planStartDate or the date is invalid.
 */
export function trackStatus(
  checkin: WealthCheckin,
  scenario: GoalScenario,
  accounts: WealthAccount[],
  inflationRate: number,
): TrackStatus | null {
  if (!scenario.planStartDate) return null
  const offset = yearOffsetFromDate(scenario.planStartDate, checkin.checkinDate)
  if (offset === null) return null
  const line = planLineOf(projectNetWorth(scenarioToParams(scenario, inflationRate)))
  const actualInvestedCents = checkinInvestedCents(checkin, accounts)
  const actualRealInvestedCents = nominalToReal(actualInvestedCents, scenario.planStartDate, checkin.checkinDate, inflationRate)
  // Within a month of a step the balance is read against whichever side of it it is on: a house
  // bought a fortnight early or late is not 70.000 euros ahead or behind.
  const reading = readAgainst(line, offset, actualRealInvestedCents)
  if (reading === null) return null
  const projected = reading.reference
  const deltaCents = actualRealInvestedCents - projected

  // A gap in money is read along the plan's line, not divided by a monthly amount: that way it
  // counts the plan's own growth, does not jump where the amount changes, and still means
  // something during a pause. Across a house payment or event there are no months to read.
  const measure = reading.nearStep
    ? ACROSS_STEP
    : measurePlanDistance(line, offset, actualRealInvestedCents)
  const along = measure.kind === 'along' ? measure : null

  return {
    projectedInvestedCents: projected,
    actualInvestedCents,
    actualRealInvestedCents,
    deltaCents,
    deltaMonths: along ? Math.round(along.months) || 0 : null,
    monthsReason: measure.kind === 'unmeasured' && !reading.onTrack ? measure.reason : null,
    planDate: along ? dateAtOffset(scenario.planStartDate, along.atOffset) : null,
    onTrack: reading.onTrack,
    nearStep: reading.nearStep
      ? { date: dateAtOffset(scenario.planStartDate, reading.nearStep.anniversary), counted: reading.nearStep.counted }
      : null,
  }
}

/**
 * Date each milestone was first observed as reached, keyed by amount in cents.
 * Milestones never seen at or above their amount are absent from the map.
 *
 * The date is the earliest check-in that recorded a value at or above the
 * milestone, not the true crossing date — the portfolio may well have crossed
 * between two check-ins. Word the UI as "reached by" rather than "reached on".
 */
export function milestonesReached(
  milestones: Milestone[],
  checkins: WealthCheckin[],
  accounts: WealthAccount[],
): Map<number, string> {
  const reached = new Map<number, string>()
  if (milestones.length === 0 || checkins.length === 0) return reached

  const byDate = [...checkins].sort((a, b) => a.checkinDate.localeCompare(b.checkinDate))
  for (const checkin of byDate) {
    const invested = checkinInvestedCents(checkin, accounts)
    for (const m of milestones) {
      if (invested >= m.amountCents && !reached.has(m.amountCents)) {
        reached.set(m.amountCents, checkin.checkinDate)
      }
    }
  }
  return reached
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
