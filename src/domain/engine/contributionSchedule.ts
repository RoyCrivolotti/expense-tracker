/**
 * Changes to the monthly amount a scenario invests, from a month on. Shared by the API, the
 * in-memory test repo and the UI so all three agree on what a storable schedule looks like, and
 * by the projection, which turns it into what each plan year contributes.
 *
 * The projection is linear in contributions, so a step needs no new algorithm: each plan year
 * contributes twelve times the average monthly rate in force over it, and the loop is otherwise
 * untouched. A schedule that changes nothing gives the same figures as before, to the cent.
 */
import type { ContributionStep } from '../types'
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

/** Keeps a step that lands exactly on an anniversary from being read as the year before it. */
const EDGE = 1e-9

/**
 * What the scenario invests each month at plan offset `t` (years from the start). The base amount
 * grows by `growth` at each whole year of the plan; a step replaces it from its month, and growth
 * then compounds on the step's amount at each anniversary of that month. A step at or before the
 * plan start is the amount the plan starts with, growing from the start.
 */
export function monthlyCentsAt(
  baseCents: number,
  growth: number,
  steps: readonly ScheduleStep[],
  t: number,
): number {
  let amount = baseCents
  let anchor = 0
  for (const step of steps) {
    if (step.offsetYears > t) break
    amount = step.monthlyCents
    anchor = Math.max(0, step.offsetYears)
  }
  return amount * Math.pow(1 + growth, Math.max(0, Math.floor(t - anchor + EDGE)))
}

/**
 * What plan year `year` contributes: twelve times the monthly rate in force, averaged over the
 * year (offsets `year - 1` to `year`) by the share of it each rate was in force for. Without a
 * step in force by then it is the base amount grown by whole years, as it always was.
 */
export function annualContributionCents(
  baseCents: number,
  growth: number,
  steps: readonly ScheduleStep[],
  year: number,
): number {
  if (year <= 0) return 0
  const lo = year - 1
  const hi = year
  if (steps.every((s) => s.offsetYears >= hi)) {
    return Math.round(baseCents * 12 * Math.pow(1 + growth, lo))
  }
  // The rate changes at a step and at each anniversary of it, so cut the year at those and read
  // the rate in the middle of each piece.
  const cuts = new Set<number>([lo, hi])
  for (const step of steps) {
    if (step.offsetYears > lo && step.offsetYears < hi) cuts.add(step.offsetYears)
    const anchor = Math.max(0, step.offsetYears)
    for (let k = Math.max(1, Math.floor(lo - anchor)); anchor + k < hi; k++) {
      if (anchor + k > lo) cuts.add(anchor + k)
    }
  }
  const edges = [...cuts].sort((a, b) => a - b)
  let monthlySum = 0
  for (let i = 1; i < edges.length; i++) {
    const from = edges[i - 1]!
    const to = edges[i]!
    monthlySum += monthlyCentsAt(baseCents, growth, steps, (from + to) / 2) * (to - from)
  }
  return Math.round(monthlySum * 12)
}
