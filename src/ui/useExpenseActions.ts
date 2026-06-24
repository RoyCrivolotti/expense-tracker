import { useMemo } from 'react'
import type { ExpenseDataset } from '../types'
import type { ExpenseDataSource, NewTransaction } from '../data/dataSource'
import type { ExpenseActions, ExpenseModalState } from './actions'
import { openAddModal } from './transactionSeed'
import {
  patchAfterAccount,
  patchAfterBulkCreate,
  patchAfterBulkDelete,
  patchAfterCashActual,
  patchAfterCategory,
  patchAfterGoals,
  patchAfterScenarioCreate,
  patchAfterScenarioDelete,
  patchAfterScenarioUpdate,
  patchAfterSettings,
  patchAfterStatementPaid,
  patchAfterTransactionCreate,
  patchAfterTransactionDelete,
  patchAfterTransactionUpdate,
} from './datasetPatches'

type OpenModal = (state: Exclude<ExpenseModalState, null>) => void
type ApplyPatch = (patch: (dataset: ExpenseDataset) => ExpenseDataset) => void

/** Build the write-actions object, or `undefined` for read-only sources. */
export function useExpenseActions(
  source: ExpenseDataSource,
  applyPatch: ApplyPatch,
  openModal: OpenModal,
): ExpenseActions | undefined {
  return useMemo(() => {
    if (!source.canWrite) return undefined
    return {
      onAdd: (seed) => openAddModal(openModal, seed),
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
      setStatementPaid: async (accountId, yearMonth, paid) => {
        const stmt = await source.setStatementPaid!(accountId, yearMonth, paid)
        applyPatch((d) => patchAfterStatementPaid(d, stmt))
      },
      setCashActual: async (yearMonth, actualCashCents) => {
        const row = await source.setCashActual!(yearMonth, actualCashCents)
        applyPatch((d) => patchAfterCashActual(d, row, yearMonth))
      },
      createCategory: async (input) => {
        const category = await source.createCategory!(input)
        applyPatch((d) => patchAfterCategory(d, category))
      },
      updateCategory: async (id, patch) => {
        const category = await source.updateCategory!(id, patch)
        applyPatch((d) => patchAfterCategory(d, category))
      },
      createAccount: async (input) => {
        const account = await source.createAccount!(input)
        applyPatch((d) => patchAfterAccount(d, account))
      },
      updateAccount: async (id, patch) => {
        const account = await source.updateAccount!(id, patch)
        applyPatch((d) => patchAfterAccount(d, account))
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
      },
      updateScenario: async (id, patch) => {
        const scenario = await source.updateScenario!(id, patch)
        applyPatch((d) => patchAfterScenarioUpdate(d, scenario))
      },
      deleteScenario: async (id) => {
        await source.deleteScenario!(id)
        applyPatch((d) => patchAfterScenarioDelete(d, id))
      },
    }
  }, [source, applyPatch, openModal])
}
