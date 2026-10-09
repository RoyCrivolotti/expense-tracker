/**
 * When the plan says a milestone will be crossed, and how that sits against the date the owner set
 * for it. A milestone is an amount on the account, so the plan's line is read in euros on the account
 * (`milestoneCrossing`), then placed on the calendar from the plan's start date.
 */
import type { GoalScenario, Milestone } from '../types'
import { DAY_MS, dateAtYears, utcDateMs } from './dates'
import { milestoneCrossing, type MilestoneCrossing } from './milestoneCrossing'
import { planLineOf } from './planLine'
import { projectNetWorth, type ProjectionParams } from './projection'
import { scenarioToParams } from './scenarioProjection'

const YEAR_DAYS = 365.25

function crossingOf(plan: GoalScenario, amountCents: number, inflationRate: number): MilestoneCrossing | null {
  const line = planLineOf(projectNetWorth(scenarioToParams(plan, inflationRate)))
  return milestoneCrossing(line, amountCents, inflationRate)
}

/** The fractional year, from the plan start, at which the plan first has the amount on the account. */
export function yearsToAmount(plan: GoalScenario, amountCents: number, inflationRate: number): number | null {
  return crossingOf(plan, amountCents, inflationRate)?.offset ?? null
}

/**
 * The first yearly step at which the plan has the amount on the account: the whole years the table
 * and the narrative count in, rounded up from the day the chip gives so the two never disagree. Null
 * when the plan does not get there within its horizon.
 */
export function wholeYearsToAmount(params: ProjectionParams, amountCents: number, inflationRate: number): number | null {
  const crossing = milestoneCrossing(planLineOf(projectNetWorth(params)), amountCents, inflationRate)
  // A crossing on an anniversary is a whole number up to the bisection's last digit.
  return crossing === null ? null : Math.max(0, Math.ceil(crossing.offset - 1e-9))
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** The calendar date the plan crosses the amount, or null without a start date or within the horizon. */
export function milestoneCrossingDate(plan: GoalScenario, amountCents: number, inflationRate: number): string | null {
  // A start date only the API could have written malformed must not take Progress down.
  if (!plan.planStartDate || !ISO_DATE.test(plan.planStartDate)) return null
  const years = yearsToAmount(plan, amountCents, inflationRate)
  return years === null ? null : dateAtYears(plan.planStartDate, years)
}

/** When the plan has the amount, what it is worth in the plan's money on that day, and when it falls back under. */
interface Outlook {
  expected: string
  /** The amount in the euros of the plan start, on the day the plan has it: what the 500.000 € is worth by then. */
  worthCents: number
  /** The date the plan falls back below it (a house payment, say), or null when it stays. */
  dipsOn: string | null
}

function outlookOf(plan: GoalScenario, amountCents: number, inflationRate: number): Outlook | null {
  if (!plan.planStartDate || !ISO_DATE.test(plan.planStartDate)) return null
  const crossing = crossingOf(plan, amountCents, inflationRate)
  if (crossing === null) return null
  return {
    expected: dateAtYears(plan.planStartDate, crossing.offset),
    worthCents: Math.round(amountCents / Math.pow(1 + inflationRate, crossing.offset)),
    dipsOn: crossing.dipsAt === null ? null : dateAtYears(plan.planStartDate, crossing.dipsAt),
  }
}

/** What the plan says about a milestone it gets to: what the amount is worth by then, and whether it holds. */
type PlanOutlook = Pick<Outlook, 'worthCents' | 'dipsOn'>

export type MilestoneStanding =
  | { kind: 'reached'; on: string }
  | ({ kind: 'on-track'; expected: string; target: string } & PlanOutlook)
  | ({ kind: 'late'; expected: string; target: string; monthsLate: number } & PlanOutlook)
  /** The plan had it crossed by a date now past, and no check-in has reached it. */
  | ({ kind: 'overdue'; expected: string; target: string | null } & PlanOutlook)
  | ({ kind: 'expected'; expected: string } & PlanOutlook)
  | { kind: 'beyond-horizon'; target: string | null }
  | { kind: 'unknown' }

/**
 * One line's worth of standing for a milestone: reached (by a check-in), on track or late
 * for its target date, expected on a date with no target, overdue, past the horizon, or
 * unknown when the plan cannot be dated. Overdue needs evidence: `asOf` is the newest
 * check-in's date, and only a check-in dated on or after the plan's expected crossing
 * that did not reach the amount can say the plan was wrong. With no check-in, or none
 * that late, the plan's own dates stand. The clock never enters into it.
 */
export function milestoneStanding(
  milestone: Milestone,
  plan: GoalScenario | null,
  reachedOn: string | undefined,
  inflationRate: number,
  asOf: string | null = null,
): MilestoneStanding {
  if (reachedOn) return { kind: 'reached', on: reachedOn }
  if (!plan?.planStartDate) return { kind: 'unknown' }
  const outlook = outlookOf(plan, milestone.amountCents, inflationRate)
  const target = milestone.targetDate ?? null
  if (!outlook) return { kind: 'beyond-horizon', target }
  const { expected, worthCents, dipsOn } = outlook
  if (asOf !== null && expected <= asOf) return { kind: 'overdue', expected, target, worthCents, dipsOn }
  if (!target) return { kind: 'expected', expected, worthCents, dipsOn }
  const lateMs = utcDateMs(expected) - utcDateMs(target)
  if (lateMs <= 0) return { kind: 'on-track', expected, target, worthCents, dipsOn }
  return {
    kind: 'late',
    expected,
    target,
    monthsLate: Math.max(1, Math.round(lateMs / DAY_MS / (YEAR_DAYS / 12))),
    worthCents,
    dipsOn,
  }
}
