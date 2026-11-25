import { validateDueDay, validatePlanInput } from '../domain/application/installmentPlanService'
import type { NewGoalScenario, NewInstallmentPlan } from '../domain/data/dataSource'
import type { ExpensePlanning } from '../domain/ports/expensePlanning'
import type { GoalScenario, InstallmentPlan, StoredTransaction } from '../domain/types'
import { RepoHttpError } from './repoHttpError'
import { assertOwnedAccount, assertOwnedCategory } from './inMemoryGuards'
import { nextId, type InMemoryState, type Op, using } from './inMemoryStore'

export const createScenario: Op<'createScenario'> = (
  state,
  owner,
  input,
) => {
  const store = state.storeFor(owner)
  if (!input.name?.trim()) throw new RepoHttpError(400, 'Scenario name is required')
  const scenario: GoalScenario = {
    id: nextId(store.goalScenarios),
    ...input,
    name: input.name.trim(),
    isActive: !store.goalScenarios.some((s) => s.isActive),
  }
  store.goalScenarios.push(scenario)
  return Promise.resolve({ ...scenario })
}

export const updateScenario: Op<'updateScenario'> = (
  state,
  owner,
  id,
  patch,
) => {
  const store = state.storeFor(owner)
  const index = store.goalScenarios.findIndex((s) => s.id === id)
  if (index < 0) throw new RepoHttpError(404, 'Scenario not found')
  const keys = Object.keys(patch) as (keyof NewGoalScenario)[]
  if (keys.length === 0) throw new RepoHttpError(400, 'Empty patch')
  const updated = { ...store.goalScenarios[index]!, ...patch, id }
  store.goalScenarios[index] = updated
  return Promise.resolve({ ...updated })
}

export const activateScenario: Op<'activateScenario'> = (
  state,
  owner,
  id,
) => {
  const store = state.storeFor(owner)
  const target = store.goalScenarios.find((s) => s.id === id)
  if (!target) throw new RepoHttpError(404, 'Scenario not found')
  store.goalScenarios = store.goalScenarios.map((s) => ({ ...s, isActive: s.id === id }))
  return Promise.resolve({ ...target, isActive: true })
}

export const deleteScenario: Op<'deleteScenario'> = (
  state,
  owner,
  id,
) => {
  const store = state.storeFor(owner)
  const index = store.goalScenarios.findIndex((s) => s.id === id)
  if (index < 0) throw new RepoHttpError(404, 'Scenario not found')
  store.goalScenarios.splice(index, 1)
  return Promise.resolve()
}

export const createInstallmentPlan: Op<'createInstallmentPlan'> = (
  state,
  owner,
  input,
) => {
  const store = state.storeFor(owner)
  const validated = validatePlanInput(input)
  assertOwnedAccount(store, validated.accountId)
  assertOwnedCategory(store, validated.categoryId)
  const { dueDayOfMonth, ...rest } = validated
  const plan: InstallmentPlan = {
    id: nextId(store.installmentPlans),
    ...rest,
    ...(dueDayOfMonth != null ? { dueDayOfMonth } : {}),
  }
  store.installmentPlans.push(plan)
  return Promise.resolve({ ...plan })
}

export const updateInstallmentPlan: Op<'updateInstallmentPlan'> = (
  state,
  owner,
  id,
  patch,
) => {
  const store = state.storeFor(owner)
  const index = store.installmentPlans.findIndex((p) => p.id === id)
  if (index < 0) throw new RepoHttpError(404, 'Installment plan not found')
  const keys = Object.keys(patch) as (keyof NewInstallmentPlan)[]
  if (keys.length === 0) throw new RepoHttpError(400, 'Empty patch')
  validateDueDay(patch.dueDayOfMonth)
  if (patch.accountId != null) assertOwnedAccount(store, patch.accountId)
  if (patch.categoryId != null) assertOwnedCategory(store, patch.categoryId)
  const { dueDayOfMonth, ...rest } = patch
  const updated: InstallmentPlan = { ...store.installmentPlans[index]!, ...rest, id }
  if ('dueDayOfMonth' in patch) {
    if (dueDayOfMonth != null) updated.dueDayOfMonth = dueDayOfMonth
    else delete updated.dueDayOfMonth
  }
  store.installmentPlans[index] = updated
  return Promise.resolve({ ...updated })
}

export const deleteInstallmentPlan: Op<'deleteInstallmentPlan'> = (
  state,
  owner,
  id,
) => {
  const store = state.storeFor(owner)
  const index = store.installmentPlans.findIndex((p) => p.id === id)
  if (index < 0) throw new RepoHttpError(404, 'Installment plan not found')
  store.installmentPlans.splice(index, 1)
  // Mirror the D1 adapter: no FK on plan_id, so unlink transactions instead
  // of leaving them pointing at a deleted plan.
  store.transactions = store.transactions.map((t) => {
    if (t.planId !== id) return t
    const copy: StoredTransaction = { ...t }
    delete copy.planId
    delete copy.installmentIndex
    return copy
  })
  return Promise.resolve()
}

export function planning(state: InMemoryState): ExpensePlanning {
  return {
    createScenario: using(state, createScenario),
    updateScenario: using(state, updateScenario),
    activateScenario: using(state, activateScenario),
    deleteScenario: using(state, deleteScenario),
    createInstallmentPlan: using(state, createInstallmentPlan),
    updateInstallmentPlan: using(state, updateInstallmentPlan),
    deleteInstallmentPlan: using(state, deleteInstallmentPlan),
  }
}
