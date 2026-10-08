/**
 * Changes to the monthly amount a scenario invests, from a month on. Shared by the API, the
 * in-memory test repo and the UI so all three agree on what a storable schedule looks like, and
 * by the projection, which turns it into what each plan year contributes.
 *
 * The projection is linear in contributions, so a step needs no new algorithm: each plan year
 * contributes twelve times the average monthly rate in force over it, and the loop is otherwise
 * untouched. A schedule that changes nothing gives the same figures as one with no schedule, to the cent.
 */
import type { ContributionStep, GoalScenario } from '../types'
import { yearsBetween } from './dates'

export const CONTRIBUTION_STEP_MAX_COUNT = 10
/** A step is a monthly amount, and a million a month is already beyond any plan. */
export const CONTRIBUTION_STEP_MAX_CENTS = 100_000_000

const STEP_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

/** What is wrong with one step on its own, else null. */
function validateStep(entry: unknown): string | null {
  if (typeof entry !== 'object' || entry === null) return 'each contribution step must be an object'
  const { from, monthlyCents } = entry as Partial<ContributionStep>
  if (typeof from !== 'string' || !STEP_MONTH.test(from)) {
    return 'a contribution step needs a month, as YYYY-MM'
  }
  if (
    typeof monthlyCents !== 'number' ||
    !Number.isInteger(monthlyCents) ||
    monthlyCents < 0 ||
    monthlyCents > CONTRIBUTION_STEP_MAX_CENTS
  ) {
    return `a contribution step's monthlyCents must be a whole number between 0 and ${CONTRIBUTION_STEP_MAX_CENTS}`
  }
  return null
}

/** Error message when the value cannot be stored as a schedule, else null. */
export function validateContributionSchedule(value: unknown): string | null {
  if (!Array.isArray(value)) return 'contributionSchedule must be an array'
  if (value.length > CONTRIBUTION_STEP_MAX_COUNT) {
    return `contributionSchedule must have at most ${CONTRIBUTION_STEP_MAX_COUNT} entries`
  }
  const months = new Set<string>()
  for (const entry of value) {
    const problem = validateStep(entry)
    if (problem) return problem
    const { from } = entry as ContributionStep
    if (months.has(from)) return `two contribution steps start in ${from}`
    months.add(from)
  }
  return null
}

/** In date order, with nothing but the two fields. Call `validateContributionSchedule` first. */
export function normalizeContributionSchedule(steps: readonly ContributionStep[]): ContributionStep[] {
  return steps
    .map(({ from, monthlyCents }) => ({ from, monthlyCents }))
    .sort((a, b) => a.from.localeCompare(b.from))
}

/**
 * The stored column as a list. Anything that is not a valid schedule (a database that has not had
 * the column added, malformed JSON) reads as no changes, so a bad row degrades to the plain plan
 * instead of an error on the Goals screen.
 */
export function parseContributionSchedule(raw: string | null | undefined): ContributionStep[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (validateContributionSchedule(parsed) !== null) return []
    return normalizeContributionSchedule(parsed as ContributionStep[])
  } catch {
    return []
  }
}

/** A step as the projection reads it: where it begins on the plan's own axis, in plan years. */
export interface ScheduleStep {
  offsetYears: number
  monthlyCents: number
}

/**
 * The schedule on the plan's axis: each step starts on the first of its month, counted in years
 * from the plan start by the calendar (whole anniversaries, then the fraction of the year). With
 * no start date there is no axis, so no step applies.
 */
export function scheduleSteps(
  planStartDate: string | null | undefined,
  schedule: readonly ContributionStep[] | undefined,
): ScheduleStep[] {
  if (!planStartDate || !schedule?.length) return []
  return schedule
    .map((s) => ({ offsetYears: yearsBetween(planStartDate, `${s.from}-01`), monthlyCents: s.monthlyCents }))
    .sort((a, b) => a.offsetYears - b.offsetYears)
}

/**
 * What the scenario invests each month at plan offset `t` (years from the start): the base amount,
 * or the amount of the latest step that has begun. A step at or before the plan start is the amount
 * the plan starts with.
 */
export function monthlyCentsAt(baseCents: number, steps: readonly ScheduleStep[], t: number): number {
  let amount = baseCents
  for (const step of steps) {
    if (step.offsetYears > t) break
    amount = step.monthlyCents
  }
  return amount
}

/**
 * The monthly rate summed over the plan offsets `from` to `to`, in cents-years: the area under
 * the rate. The rate only changes at a step, so the span is cut there and each piece read at its
 * middle.
 */
function monthlyIntegral(baseCents: number, steps: readonly ScheduleStep[], from: number, to: number): number {
  const edges = [from, ...steps.map((s) => s.offsetYears).filter((o) => o > from && o < to), to]
  let sum = 0
  for (let i = 1; i < edges.length; i++) {
    const a = edges[i - 1]!
    const b = edges[i]!
    sum += monthlyCentsAt(baseCents, steps, (a + b) / 2) * (b - a)
  }
  return sum
}

/**
 * What plan year `year` contributes: twelve times the monthly rate in force, averaged over the
 * year (offsets `year - 1` to `year`) by the share of it each rate was in force for. Without a
 * step in force by then it is the base amount for twelve months.
 */
export function annualContributionCents(baseCents: number, steps: readonly ScheduleStep[], year: number): number {
  if (year <= 0) return 0
  if (steps.every((s) => s.offsetYears >= year)) return Math.round(baseCents * 12)
  return Math.round(monthlyIntegral(baseCents, steps, year - 1, year) * 12)
}

/** The fields of a scenario the planned monthly amount is read from. */
export type PlannedMonthly = Pick<GoalScenario, 'planStartDate' | 'monthlyContributionCents' | 'contributionSchedule'>

/** Years from the plan start to a date, never before it; 0 with no start to count from. */
function offsetOn(scenario: PlannedMonthly, date: string): number {
  if (!scenario.planStartDate) return 0
  return Math.max(0, yearsBetween(scenario.planStartDate, date))
}

/**
 * What the plan invests each month on a date (`YYYY-MM-DD`): the base amount, or the change in
 * force. A date before the plan start reads as the start.
 */
export function plannedMonthlyAt(scenario: PlannedMonthly, date: string): number {
  const steps = scheduleSteps(scenario.planStartDate, scenario.contributionSchedule)
  return monthlyCentsAt(scenario.monthlyContributionCents, steps, offsetOn(scenario, date))
}

/**
 * The mean of what the plan invests each month over budget months (`YYYY-MM`), each read in its
 * middle: the figure the pace actually kept is set against, which is also a mean of months. Zero
 * for no months.
 */
export function plannedMonthlyAverage(scenario: PlannedMonthly, months: readonly string[]): number {
  if (months.length === 0) return 0
  const total = months.reduce((sum, month) => sum + plannedMonthlyAt(scenario, `${month}-15`), 0)
  return Math.round(total / months.length)
}

/** The first change that starts after `date`, for saying what is coming; null when there is none. */
export function nextContributionStep(
  scenario: Pick<GoalScenario, 'contributionSchedule'>,
  date: string,
): ContributionStep | null {
  const month = date.slice(0, 7)
  return (scenario.contributionSchedule ?? []).find((s) => s.from > month) ?? null
}
