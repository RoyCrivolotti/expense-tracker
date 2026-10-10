import type { NewGoalScenario, ScenarioPatch } from '../data/dataSource'
import {
  normalizeContributionSchedule,
  validateContributionSchedule,
} from '../engine/contributionSchedule'
import { isCalendarDate } from '../engine/dates'
import { DEFAULT_HOME_CARRY_RATE, DEFAULT_RETIREMENT_YEARS, RETIREMENT_YEARS_MAX } from '../engine/projectionConstants'
import type { ExpenseRepository } from '../ports/expenseRepository'
import { ValidationError } from './validationError'

export function validateScenarioName(name: string | undefined): string {
  const trimmed = name?.trim()
  if (!trimmed) throw new ValidationError('Scenario name is required')
  return trimmed
}

/** Amounts: whole cents, never negative. */
const CENTS_FIELDS = [
  'startInvestedCents',
  'monthlyContributionCents',
  'housePriceCents',
  'transactionCostsCents',
  'rentMonthlyCents',
  'annualSpendCents',
] as const

/** Counts of years: whole, at least one. */
const YEAR_COUNT_FIELDS = ['horizonYears', 'retirementYears'] as const

/** Rates and fractions. Free to be negative (a pessimistic return is a real scenario),
 *  but they must be numbers, because the projection multiplies by them. */
const RATE_FIELDS = [
  'expectedRealReturn',
  'mortgageRateAnnual',
  'houseAppreciationRate',
] as const

/**
 * What the projection engine needs to hold, checked on the server.
 *
 * Deliberately *not* the ranges the sliders offer. Those are a product judgement about
 * what is comfortable to drag through, and enforcing them here would reject a value
 * that was legitimate when it was saved and narrow the API to one client's taste.
 * These are the conditions under which the engine produces a number at all.
 *
 * The one that bites: `fireNumber` returns Infinity for a withdrawal rate of zero or
 * less, by design, and `formatCents` had no answer for Infinity, so a scenario saved
 * with `safeWithdrawalRate: 0` rendered the FI target as garbage on the Goals screen.
 * Every field here was previously written straight to SQLite with only the name checked.
 */
const MIN_MORTGAGE_TERM_YEARS = 0.001

function assertWholeAtLeast(value: unknown, min: number, message: string): void {
  if (!Number.isInteger(value) || (value as number) < min) throw new ValidationError(message)
}

function assertInClosedRange(value: number, lo: number, hi: number, message: string): void {
  if (!Number.isFinite(value) || value < lo || value > hi) throw new ValidationError(message)
}

/**
 * The editor's date picker cannot write anything but a day, so only a hand-made request can: a start that does not exist
 * would be dated as if it did.
 */
function validatePlanStartDate(value: unknown): void {
  if (value === undefined || value === null) return
  if (typeof value !== 'string' || !isCalendarDate(value)) throw new ValidationError('planStartDate must be a calendar date, or null')
}

export function validateScenarioNumbers(patch: Partial<NewGoalScenario>): void {
  const rec = patch as Record<string, unknown>

  for (const key of CENTS_FIELDS) {
    if (rec[key] !== undefined) {
      assertWholeAtLeast(rec[key], 0, `${key} must be a whole number of cents, zero or more`)
    }
  }

  for (const key of YEAR_COUNT_FIELDS) {
    if (rec[key] !== undefined) {
      assertWholeAtLeast(rec[key], 1, `${key} must be a whole number of years, at least 1`)
    }
  }

  // A loan can have months left, so its term is a number of years that need not be whole. A re-baseline in a
  // loan's last month writes about 0.003, so the floor is a day or so, not a month: a term of 5e-324 makes the
  // payment Infinity and the Goals screen NaN.
  if (rec.mortgageTermYears !== undefined) {
    assertInClosedRange(rec.mortgageTermYears as number, MIN_MORTGAGE_TERM_YEARS, 100, 'mortgageTermYears must be a number of years from 0.001 to 100')
  }

  for (const key of RATE_FIELDS) {
    if (rec[key] !== undefined && !Number.isFinite(rec[key])) {
      throw new ValidationError(`${key} must be a number`)
    }
  }

  validateScenarioFractions(patch)

  validatePlanStartDate(rec.planStartDate)

  if (rec.contributionSchedule !== undefined) {
    const problem = validateContributionSchedule(rec.contributionSchedule)
    if (problem) throw new ValidationError(problem)
  }

  // Zero is a real answer here, not a missing one: the type says `0 = owned from day
  // one`, rentVsBuy builds its "buy now" comparison with it, and the slider offers it
  // as "Now". Only `null` means never buy, and that is already excluded above.
  if (patch.housePurchaseYear != null) {
    assertWholeAtLeast(
      patch.housePurchaseYear,
      0,
      'housePurchaseYear must be a whole year, zero or more',
    )
  }
}

/** The two fields bounded on both sides, split out to keep the sweep above readable. */
function validateScenarioFractions(patch: Partial<NewGoalScenario>): void {
  if (patch.safeWithdrawalRate !== undefined) {
    // Open at the bottom, unlike downPaymentFraction: fireNumber divides by this.
    const swr = patch.safeWithdrawalRate
    if (!Number.isFinite(swr) || swr <= 0 || swr > 1) {
      throw new ValidationError('safeWithdrawalRate must be greater than 0 and at most 1')
    }
  }

  if (patch.downPaymentFraction !== undefined) {
    assertInClosedRange(
      patch.downPaymentFraction,
      0,
      1,
      'downPaymentFraction must be between 0 and 1',
    )
  }

  // The drawdown loops over every one of these years, so an absurd number would hang the chart, and no plan runs this long.
  if (patch.retirementYears !== undefined) {
    assertInClosedRange(patch.retirementYears, 1, RETIREMENT_YEARS_MAX, `retirementYears must be between 1 and ${RETIREMENT_YEARS_MAX}`)
  }

  // A tenth of the house's value a year is already more than owning costs anywhere; above it is a typo.
  if (patch.homeCarryRate !== undefined) {
    assertInClosedRange(patch.homeCarryRate, 0, 0.1, 'homeCarryRate must be between 0 and 0.1')
  }
}

export async function createScenario(
  repo: ExpenseRepository,
  owner: string,
  input: NewGoalScenario,
) {
  validateScenarioNumbers(input)
  const named = { ...input, name: validateScenarioName(input.name) }
  // A client that predates the field posts without it.
  return repo.createScenario(owner, withSortedSchedule({ ...named, homeCarryRate: input.homeCarryRate ?? DEFAULT_HOME_CARRY_RATE, retirementYears: input.retirementYears ?? DEFAULT_RETIREMENT_YEARS }))
}

export async function patchScenario(
  repo: ExpenseRepository,
  owner: string,
  id: number,
  patch: ScenarioPatch,
) {
  const keys = Object.keys(patch)
  if (keys.length === 0) throw new ValidationError('Empty patch')
  if ('isActive' in patch) {
    // Activation moves the flag off another row, which a field patch must never do;
    // and there is no "deactivate" — an owner either has a plan or picks another.
    if (patch.isActive !== true || keys.length !== 1) {
      throw new ValidationError('isActive can only be set to true, and only on its own')
    }
    return repo.activateScenario(owner, id)
  }
  // A name that is being changed has to be one, as it does when the scenario is made: an empty
  // one saved as "Saved" and left a tab with nothing on it.
  const checked = 'name' in patch ? { ...patch, name: validateScenarioName(patch.name) } : patch
  validateScenarioNumbers(checked)
  return repo.updateScenario(owner, id, withSortedSchedule(checked))
}

/** Stored in date order, whatever order it arrived in, so the editor and the engine read one thing. */
function withSortedSchedule<T extends Partial<NewGoalScenario>>(scenario: T): T {
  if (!scenario.contributionSchedule) return scenario
  return { ...scenario, contributionSchedule: normalizeContributionSchedule(scenario.contributionSchedule) }
}

export async function removeScenario(repo: ExpenseRepository, owner: string, id: number) {
  await repo.deleteScenario(owner, id)
}
