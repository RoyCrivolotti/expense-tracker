import type { ExpenseDataset, GoalScenario, InstallmentPlan, WealthAccount, WealthCheckin } from '../types'
import { cloneDataset, upsertById } from './datasetPatchHelpers'

function sortScenarios(scenarios: GoalScenario[]): GoalScenario[] {
  return scenarios.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
}

/** The server keeps one plan per owner; mirror that so no reload is needed to see it. */
function withOnlyPlan(
  scenarios: GoalScenario[],
  plan: GoalScenario,
): GoalScenario[] {
  return scenarios.map((s) => (s.id === plan.id ? plan : { ...s, isActive: false }))
}

export function patchAfterScenarioCreate(
  dataset: ExpenseDataset,
  scenario: GoalScenario,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  // An owner's first scenario comes back as their plan.
  const others = scenario.isActive ? withOnlyPlan(d.goalScenarios, scenario) : d.goalScenarios
  d.goalScenarios = sortScenarios([...others, scenario])
  return d
}

/**
 * Moves the plan to a scenario. The row the server sent back is only the news that it is the plan:
 * an edit saved while the answer was on its way is newer than the fields in it.
 */
export function patchAfterScenarioActivate(
  dataset: ExpenseDataset,
  scenario: GoalScenario,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.goalScenarios = d.goalScenarios.some((s) => s.id === scenario.id)
    ? d.goalScenarios.map((s) => ({ ...s, isActive: s.id === scenario.id }))
    : withOnlyPlan(d.goalScenarios, scenario)
  sortScenarios(d.goalScenarios)
  return d
}

/**
 * Takes the edited row the server sent back. Saving edits never moves the plan, so which scenario
 * is the plan stays as the dataset has it: the row may have been written before an activation
 * whose answer has already arrived.
 */
export function patchAfterScenarioUpdate(
  dataset: ExpenseDataset,
  scenario: GoalScenario,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  const have = d.goalScenarios.find((s) => s.id === scenario.id)
  upsertById(d.goalScenarios, have ? { ...scenario, isActive: have.isActive } : scenario)
  sortScenarios(d.goalScenarios)
  return d
}

export function patchAfterScenarioDelete(
  dataset: ExpenseDataset,
  id: number,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.goalScenarios = d.goalScenarios.filter((s) => s.id !== id)
  return d
}

export function patchAfterInstallmentPlanCreate(
  dataset: ExpenseDataset,
  plan: InstallmentPlan,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.installmentPlans = [...d.installmentPlans, plan]
  return d
}

export function patchAfterInstallmentPlanUpdate(
  dataset: ExpenseDataset,
  plan: InstallmentPlan,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  upsertById(d.installmentPlans, plan)
  return d
}

export function patchAfterInstallmentPlanDelete(
  dataset: ExpenseDataset,
  id: number,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.installmentPlans = d.installmentPlans.filter((p) => p.id !== id)
  return d
}

export function patchAfterWealthAccountCreate(
  dataset: ExpenseDataset,
  account: WealthAccount,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.wealthAccounts = [...d.wealthAccounts, account].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  return d
}

export function patchAfterWealthAccountUpdate(
  dataset: ExpenseDataset,
  account: WealthAccount,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  upsertById(d.wealthAccounts, account)
  d.wealthAccounts.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  return d
}

export function patchAfterWealthAccountDelete(
  dataset: ExpenseDataset,
  id: number,
  archived: boolean,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  if (archived) {
    // Server soft-deleted (archived) because the account has check-in history.
    d.wealthAccounts = d.wealthAccounts.map((a) => (a.id === id ? { ...a, archived: true } : a))
  } else {
    d.wealthAccounts = d.wealthAccounts.filter((a) => a.id !== id)
  }
  return d
}

export function patchAfterWealthCheckinCreate(
  dataset: ExpenseDataset,
  checkin: WealthCheckin,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.wealthCheckins = [checkin, ...d.wealthCheckins].sort(
    (a, b) => b.checkinDate.localeCompare(a.checkinDate) || b.id - a.id,
  )
  return d
}

export function patchAfterWealthCheckinUpdate(
  dataset: ExpenseDataset,
  checkin: WealthCheckin,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  upsertById(d.wealthCheckins, checkin)
  d.wealthCheckins.sort((a, b) => b.checkinDate.localeCompare(a.checkinDate) || b.id - a.id)
  return d
}

export function patchAfterWealthCheckinDelete(
  dataset: ExpenseDataset,
  id: number,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.wealthCheckins = d.wealthCheckins.filter((c) => c.id !== id)
  return d
}
