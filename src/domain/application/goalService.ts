import type { NewGoalScenario, ScenarioPatch } from '../data/dataSource'
import { normalizeContributionSchedule } from '../engine/contributionSchedule'
import { DEFAULT_HOME_CARRY_RATE, DEFAULT_RETIREMENT_YEARS } from '../engine/projectionConstants'
import type { ExpenseRepository } from '../ports/expenseRepository'
import { assertRequiredOnCreate, validateScenarioName, validateScenarioNumbers } from './goalScenarioValidation'
import { ValidationError } from './validationError'

export async function createScenario(
  repo: ExpenseRepository,
  owner: string,
  input: NewGoalScenario,
) {
  assertRequiredOnCreate(input)
  validateScenarioNumbers(input)
  const named = { ...input, name: validateScenarioName(input.name) }
  // A client that predates the field posts without it.
  return repo.createScenario(
    owner,
    withSortedSchedule({
      ...named,
      homeCarryRate: input.homeCarryRate ?? DEFAULT_HOME_CARRY_RATE,
      retirementYears: input.retirementYears ?? DEFAULT_RETIREMENT_YEARS,
    }),
  )
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

export async function removeScenario(
  repo: ExpenseRepository,
  owner: string,
  id: number,
) {
  await repo.deleteScenario(owner, id)
}
