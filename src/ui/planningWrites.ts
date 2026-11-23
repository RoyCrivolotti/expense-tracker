import type { ExpenseDataSource } from '../data/dataSource'
import type { ExpenseActions } from './actions'
import type { ApplyPatch } from './bulkWrite'
import {
  patchAfterInstallmentPlanCreate,
  patchAfterInstallmentPlanDelete,
  patchAfterInstallmentPlanUpdate,
  patchAfterScenarioActivate,
  patchAfterScenarioCreate,
  patchAfterScenarioDelete,
  patchAfterScenarioUpdate,
  patchAfterWealthAccountCreate,
  patchAfterWealthAccountDelete,
  patchAfterWealthAccountUpdate,
  patchAfterWealthCheckinCreate,
  patchAfterWealthCheckinDelete,
  patchAfterWealthCheckinUpdate,
} from './planningPatches'

type PlanningWrites =
  | 'createScenario'
  | 'updateScenario'
  | 'activateScenario'
  | 'deleteScenario'
  | 'createInstallmentPlan'
  | 'updateInstallmentPlan'
  | 'deleteInstallmentPlan'

/** The writes of goal scenarios and installment plans. */
export function planningWrites(
  source: ExpenseDataSource,
  applyPatch: ApplyPatch,
): Pick<ExpenseActions, PlanningWrites> {
  return {
    createScenario: async (input) => {
      const scenario = await source.createScenario!(input)
      applyPatch((d) => patchAfterScenarioCreate(d, scenario))
      return scenario
    },
    updateScenario: async (
      id,
      patch,
    ) => {
      const scenario = await source.updateScenario!(id, patch)
      applyPatch((d) => patchAfterScenarioUpdate(d, scenario))
    },
    activateScenario: async (id) => {
      const scenario = await source.activateScenario!(id)
      applyPatch((d) => patchAfterScenarioActivate(d, scenario))
    },
    deleteScenario: async (id) => {
      await source.deleteScenario!(id)
      applyPatch((d) => patchAfterScenarioDelete(d, id))
    },
    createInstallmentPlan: async (input) => {
      const plan = await source.createInstallmentPlan!(input)
      applyPatch((d) => patchAfterInstallmentPlanCreate(d, plan))
      return plan
    },
    updateInstallmentPlan: async (
      id,
      patch,
    ) => {
      const plan = await source.updateInstallmentPlan!(id, patch)
      applyPatch((d) => patchAfterInstallmentPlanUpdate(d, plan))
    },
    deleteInstallmentPlan: async (id) => {
      await source.deleteInstallmentPlan!(id)
      applyPatch((d) => patchAfterInstallmentPlanDelete(d, id))
    },
  }
}

type WealthWrites =
  | 'createWealthAccount'
  | 'updateWealthAccount'
  | 'deleteWealthAccount'
  | 'createWealthCheckin'
  | 'updateWealthCheckin'
  | 'deleteWealthCheckin'

/** The writes of wealth accounts and their check-ins. */
export function wealthWrites(
  source: ExpenseDataSource,
  applyPatch: ApplyPatch,
): Pick<ExpenseActions, WealthWrites> {
  return {
    createWealthAccount: async (input) => {
      const account = await source.createWealthAccount!(input)
      applyPatch((d) => patchAfterWealthAccountCreate(d, account))
      return account
    },
    updateWealthAccount: async (
      id,
      patch,
    ) => {
      const account = await source.updateWealthAccount!(id, patch)
      applyPatch((d) => patchAfterWealthAccountUpdate(d, account))
    },
    deleteWealthAccount: async (id) => {
      // The server archives an account that check-ins refer to and removes any other.
      const { archived } = await source.deleteWealthAccount!(id)
      applyPatch((d) => patchAfterWealthAccountDelete(d, id, archived))
    },
    createWealthCheckin: async (input) => {
      const checkin = await source.createWealthCheckin!(input)
      applyPatch((d) => patchAfterWealthCheckinCreate(d, checkin))
      return checkin
    },
    updateWealthCheckin: async (
      id,
      patch,
    ) => {
      const checkin = await source.updateWealthCheckin!(id, patch)
      applyPatch((d) => patchAfterWealthCheckinUpdate(d, checkin))
    },
    deleteWealthCheckin: async (id) => {
      await source.deleteWealthCheckin!(id)
      applyPatch((d) => patchAfterWealthCheckinDelete(d, id))
    },
  }
}
