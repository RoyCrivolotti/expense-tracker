import type { NewGoalScenario } from '../data/dataSource'
import type { ExpenseRepository } from '../ports/expenseRepository'
import type { GoalInputs } from '../types'

export function validateScenarioName(name: string | undefined): string {
  const trimmed = name?.trim()
  if (!trimmed) throw new Error('Scenario name is required')
  return trimmed
}

export async function saveGoals(
  repo: ExpenseRepository,
  owner: string,
  patch: Partial<GoalInputs>,
) {
  return repo.updateGoals(owner, patch)
}

export async function createScenario(
  repo: ExpenseRepository,
  owner: string,
  input: NewGoalScenario,
) {
  return repo.createScenario(owner, { ...input, name: validateScenarioName(input.name) })
}

export async function patchScenario(
  repo: ExpenseRepository,
  owner: string,
  id: number,
  patch: Partial<NewGoalScenario>,
) {
  if (Object.keys(patch).length === 0) throw new Error('Empty patch')
  return repo.updateScenario(owner, id, patch)
}

export async function removeScenario(repo: ExpenseRepository, owner: string, id: number) {
  await repo.deleteScenario(owner, id)
}
