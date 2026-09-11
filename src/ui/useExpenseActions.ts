import { useMemo } from 'react'
import type { ExpenseDataset } from '../types'
import type { BulkTransactionPatch, ExpenseDataSource, NewTransaction } from '../data/dataSource'
import type { ExpenseActions, ExpenseModalState } from './actions'
import { duplicateHint, openAddModal, transactionToSeed } from './transactionSeed'
import {
  patchAfterAccount,
  patchAfterAccountDelete,
  patchAfterBulkCreate,
  patchAfterBulkDelete,
  patchAfterBulkUpdate,
  patchAfterCashActual,
  patchAfterBulkFlag,
  patchAfterCategory,
  patchAfterCategoryDelete,
  patchAfterFlag,
  patchAfterFlagDelete,
  patchAfterGoals,
  patchAfterInstallmentPlanCreate,
  patchAfterInstallmentPlanDelete,
  patchAfterInstallmentPlanUpdate,
  patchAfterScenarioCreate,
  patchAfterScenarioDelete,
  patchAfterScenarioUpdate,
  patchAfterSettings,
  patchAfterStatementPaid,
  patchAfterTransactionCreate,
  patchAfterTransactionDelete,
  patchAfterTransactionUpdate,
  patchAfterWealthAccountCreate,
  patchAfterWealthAccountDelete,
  patchAfterWealthAccountUpdate,
  patchAfterWealthCheckinCreate,
  patchAfterWealthCheckinDelete,
  patchAfterWealthCheckinUpdate,
} from './datasetPatches'

type OpenModal = (state: Exclude<ExpenseModalState, null>) => void
type ApplyPatch = (patch: (dataset: ExpenseDataset) => ExpenseDataset) => void

/** Build the write-actions object, or `undefined` for read-only sources. */
export function useExpenseActions(
  source: ExpenseDataSource,
  applyPatch: ApplyPatch,
  openModal: OpenModal,
  readOnly = false,
): ExpenseActions | undefined {
  return useMemo(() => {
    if (!source.canWrite || readOnly) return undefined
    return {
      onAdd: (seed) => openAddModal(openModal, seed),
      onDuplicate: (txn) =>
        openModal({ mode: 'add', seed: transactionToSeed(txn), hint: duplicateHint(txn) }),
      onEdit: (txn) => openModal({ mode: 'edit', txn }),
      createTransaction: async (input: NewTransaction) => {
        const txn = await source.createTransaction!(input)
        applyPatch((d) => patchAfterTransactionCreate(d, txn))
      },
      createTransactions: async (inputs: NewTransaction[]) => {
        const txns = await source.createTransactions!(inputs)
        applyPatch((d) => patchAfterBulkCreate(d, txns))
      },
      updateTransaction: async (id: number, patch: Partial<NewTransaction>) => {
        const txn = await source.updateTransaction!(id, patch)
        applyPatch((d) => patchAfterTransactionUpdate(d, txn))
      },
      deleteTransaction: async (id) => {
        await source.deleteTransaction!(id)
        applyPatch((d) => patchAfterTransactionDelete(d, id))
      },
      deleteTransactions: async (ids) => {
        await source.deleteTransactions!(ids)
        applyPatch((d) => patchAfterBulkDelete(d, ids))
      },
      updateTransactions: async (ids: number[], patch: BulkTransactionPatch) => {
        const result = await source.updateTransactions!(ids, patch)
        applyPatch((d) => patchAfterBulkUpdate(d, result.transactions))
      },
      setStatementPaid: async (accountId, yearMonth, paid, paidOn) => {
        const stmt = await source.setStatementPaid!(accountId, yearMonth, paid, paidOn)
        applyPatch((d) => patchAfterStatementPaid(d, stmt))
      },
      setCashActual: async (yearMonth, actualCashCents) => {
        const row = await source.setCashActual!(yearMonth, actualCashCents)
        applyPatch((d) => patchAfterCashActual(d, row, yearMonth))
      },
      createFlag: async (input) => {
        const flag = await source.createFlag!(input)
        applyPatch((d) => patchAfterFlag(d, flag))
        return flag
      },
      updateFlag: async (id, patch) => {
        const flag = await source.updateFlag!(id, patch)
        applyPatch((d) => patchAfterFlag(d, flag))
      },
      deleteFlag: async (id) => {
        const result = await source.deleteFlag!(id)
        applyPatch((d) => patchAfterFlagDelete(d, id))
        return result
      },
      setTransactionsFlag: async (ids, flagId) => {
        const txns = await source.setTransactionsFlag!(ids, flagId)
        applyPatch((d) => patchAfterBulkFlag(d, txns))
      },
      createCategory: async (input) => {
        const category = await source.createCategory!(input)
        applyPatch((d) => patchAfterCategory(d, category))
      },
      updateCategory: async (id, patch) => {
        const category = await source.updateCategory!(id, patch)
        applyPatch((d) => patchAfterCategory(d, category))
      },
      deleteCategory: async (id, options) => {
        const result = await source.deleteCategory!(id, options)
        applyPatch((d) => patchAfterCategoryDelete(d, id, result))
        return result
      },
      createAccount: async (input) => {
        const account = await source.createAccount!(input)
        applyPatch((d) => patchAfterAccount(d, account))
      },
      updateAccount: async (id, patch) => {
        const account = await source.updateAccount!(id, patch)
        applyPatch((d) => patchAfterAccount(d, account))
      },
      deleteAccount: async (id, options) => {
        const result = await source.deleteAccount!(id, options)
        applyPatch((d) => patchAfterAccountDelete(d, id, result))
        return result
      },
      updateSettings: async (patch) => {
        const settings = await source.updateSettings!(patch)
        applyPatch((d) => patchAfterSettings(d, settings))
      },
      updateGoals: async (patch) => {
        const goals = await source.updateGoals!(patch)
        applyPatch((d) => patchAfterGoals(d, goals))
      },
      createScenario: async (input) => {
        const scenario = await source.createScenario!(input)
        applyPatch((d) => patchAfterScenarioCreate(d, scenario))
        return scenario
      },
      updateScenario: async (id, patch) => {
        const scenario = await source.updateScenario!(id, patch)
        applyPatch((d) => patchAfterScenarioUpdate(d, scenario))
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
      updateInstallmentPlan: async (id, patch) => {
        const plan = await source.updateInstallmentPlan!(id, patch)
        applyPatch((d) => patchAfterInstallmentPlanUpdate(d, plan))
      },
      deleteInstallmentPlan: async (id) => {
        await source.deleteInstallmentPlan!(id)
        applyPatch((d) => patchAfterInstallmentPlanDelete(d, id))
      },
      createWealthAccount: async (input) => {
        const account = await source.createWealthAccount!(input)
        applyPatch((d) => patchAfterWealthAccountCreate(d, account))
        return account
      },
      updateWealthAccount: async (id, patch) => {
        const account = await source.updateWealthAccount!(id, patch)
        applyPatch((d) => patchAfterWealthAccountUpdate(d, account))
      },
      deleteWealthAccount: async (id) => {
        await source.deleteWealthAccount!(id)
        // The server may soft-delete (archive) if the account has check-in history.
        // Re-fetch is cheapest; optimistic assumes archived=true (conservative).
        applyPatch((d) => patchAfterWealthAccountDelete(d, id, true))
      },
      createWealthCheckin: async (input) => {
        const checkin = await source.createWealthCheckin!(input)
        applyPatch((d) => patchAfterWealthCheckinCreate(d, checkin))
        return checkin
      },
      updateWealthCheckin: async (id, patch) => {
        const checkin = await source.updateWealthCheckin!(id, patch)
        applyPatch((d) => patchAfterWealthCheckinUpdate(d, checkin))
      },
      deleteWealthCheckin: async (id) => {
        await source.deleteWealthCheckin!(id)
        applyPatch((d) => patchAfterWealthCheckinDelete(d, id))
      },
    }
  }, [source, applyPatch, openModal, readOnly])
}
