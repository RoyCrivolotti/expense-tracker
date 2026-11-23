import type { ExpenseRepository } from '../../domain/ports/expenseRepository'
import type { Env } from '../env'
import { activateScenario, createScenario, deleteScenario, updateScenario } from '../dbScenarios'
import { createInstallmentPlan, deleteInstallmentPlan, updateInstallmentPlan } from '../dbInstallments'
import { createWealthAccount, deleteWealthAccount, updateWealthAccount } from '../dbWealth'
import { createWealthCheckin, deleteWealthCheckin, updateWealthCheckin } from '../dbWealthCheckins'

type Planning = Pick<
  ExpenseRepository,
  | 'createScenario'
  | 'updateScenario'
  | 'activateScenario'
  | 'deleteScenario'
  | 'createInstallmentPlan'
  | 'updateInstallmentPlan'
  | 'deleteInstallmentPlan'
>

/** Goal scenarios and installment plans. */
export function planning(env: Env): Planning {
  return {
    createScenario: (
      owner,
      input,
    ) => createScenario(env, owner, input),
    updateScenario: (
      owner,
      id,
      patch,
    ) => updateScenario(env, owner, id, patch),
    activateScenario: (
      owner,
      id,
    ) => activateScenario(env, owner, id),
    deleteScenario: (
      owner,
      id,
    ) => deleteScenario(env, owner, id),
    createInstallmentPlan: (
      owner,
      input,
    ) => createInstallmentPlan(env, owner, input),
    updateInstallmentPlan: (
      owner,
      id,
      patch,
    ) => updateInstallmentPlan(env, owner, id, patch),
    deleteInstallmentPlan: (
      owner,
      id,
    ) => deleteInstallmentPlan(env, owner, id),
  }
}

type Wealth = Pick<
  ExpenseRepository,
  | 'createWealthAccount'
  | 'updateWealthAccount'
  | 'deleteWealthAccount'
  | 'createWealthCheckin'
  | 'updateWealthCheckin'
  | 'deleteWealthCheckin'
>

/** Wealth accounts and check-ins. */
export function wealth(env: Env): Wealth {
  return {
    createWealthAccount: (
      owner,
      input,
    ) => createWealthAccount(env, owner, input),
    updateWealthAccount: (
      owner,
      id,
      patch,
    ) => updateWealthAccount(env, owner, id, patch),
    deleteWealthAccount: (
      owner,
      id,
    ) => deleteWealthAccount(env, owner, id),
    createWealthCheckin: (
      owner,
      input,
    ) => createWealthCheckin(env, owner, input),
    updateWealthCheckin: (
      owner,
      id,
      patch,
    ) => updateWealthCheckin(env, owner, id, patch),
    deleteWealthCheckin: (
      owner,
      id,
    ) => deleteWealthCheckin(env, owner, id),
  }
}
