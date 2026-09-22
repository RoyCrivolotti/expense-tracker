import type { NewGoalScenario, ScenarioPatch } from '../data/dataSource'
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
const YEAR_COUNT_FIELDS = ['horizonYears', 'mortgageTermYears'] as const

/** Rates and fractions. Free to be negative (a pessimistic return is a real scenario),
 *  but they must be numbers, because the projection multiplies by them. */
const RATE_FIELDS = [
  'annualContributionGrowth',
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
function assertWholeAtLeast(value: unknown, min: number, message: string): void {
  if (!Number.isInteger(value) || (value as number) < min) throw new ValidationError(message)
}

function assertInClosedRange(value: number, lo: number, hi: number, message: string): void {
  if (!Number.isFinite(value) || value < lo || value > hi) throw new ValidationError(message)
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

  for (const key of RATE_FIELDS) {
    if (rec[key] !== undefined && !Number.isFinite(rec[key])) {
      throw new ValidationError(`${key} must be a number`)
    }
  }

  validateScenarioFractions(patch)

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
}

export async function createScenario(
  repo: ExpenseRepository,
  owner: string,
  input: NewGoalScenario,
) {
  validateScenarioNumbers(input)
  return repo.createScenario(owner, { ...input, name: validateScenarioName(input.name) })
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
  validateScenarioNumbers(patch)
  return repo.updateScenario(owner, id, patch)
}

export async function removeScenario(repo: ExpenseRepository, owner: string, id: number) {
  await repo.deleteScenario(owner, id)
}
