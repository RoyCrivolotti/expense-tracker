import type { ExpenseDataSource } from '../data/dataSource'
import type { ExpenseActions } from './actions'
import type { ApplyPatch } from './bulkWrite'
import {
  patchAfterAccount,
  patchAfterAccountDelete,
  patchAfterCategory,
  patchAfterCategoryDelete,
  patchAfterFlag,
  patchAfterFlagDelete,
  patchAfterLabel,
  patchAfterLabelDelete,
} from './referencePatches'
import { patchAfterTransactionUpdate } from './datasetPatches'

type TagWrites =
  'createFlag' | 'updateFlag' | 'deleteFlag' | 'createLabel' | 'updateLabel' | 'deleteLabel' | 'setTransactionLabels'

/** The writes of flags and labels, and of the labels on a transaction. */
export function tagWrites(
  source: ExpenseDataSource,
  applyPatch: ApplyPatch,
): Pick<ExpenseActions, TagWrites> {
  return {
    createFlag: async (input) => {
      const flag = await source.createFlag!(input)
      applyPatch((d) => patchAfterFlag(d, flag))
      return flag
    },
    updateFlag: async (
      id,
      patch,
    ) => {
      const flag = await source.updateFlag!(id, patch)
      applyPatch((d) => patchAfterFlag(d, flag))
    },
    deleteFlag: async (id) => {
      const result = await source.deleteFlag!(id)
      applyPatch((d) => patchAfterFlagDelete(d, id))
      return result
    },
    createLabel: async (input) => {
      const label = await source.createLabel!(input)
      applyPatch((d) => patchAfterLabel(d, label))
      return label
    },
    updateLabel: async (
      id,
      patch,
    ) => {
      const label = await source.updateLabel!(id, patch)
      applyPatch((d) => patchAfterLabel(d, label))
    },
    deleteLabel: async (id) => {
      const result = await source.deleteLabel!(id)
      applyPatch((d) => patchAfterLabelDelete(d, id))
      return result
    },
    setTransactionLabels: async (
      transactionId,
      labelIds,
    ) => {
      const txn = await source.setTransactionLabels!(transactionId, labelIds)
      applyPatch((d) => patchAfterTransactionUpdate(d, txn), { ids: [transactionId], patch: {} })
    },
  }
}

type ReferenceWrites =
  'createCategory' | 'updateCategory' | 'deleteCategory' | 'createAccount' | 'updateAccount' | 'deleteAccount'

/** The writes of categories and accounts. */
export function referenceWrites(
  source: ExpenseDataSource,
  applyPatch: ApplyPatch,
): Pick<ExpenseActions, ReferenceWrites> {
  return {
    createCategory: async (input) => {
      const category = await source.createCategory!(input)
      applyPatch((d) => patchAfterCategory(d, category))
    },
    updateCategory: async (
      id,
      patch,
    ) => {
      const category = await source.updateCategory!(id, patch)
      applyPatch((d) => patchAfterCategory(d, category))
    },
    deleteCategory: async (
      id,
      options,
    ) => {
      const result = await source.deleteCategory!(id, options)
      applyPatch((d) => patchAfterCategoryDelete(d, id, result))
      return result
    },
    createAccount: async (input) => {
      const account = await source.createAccount!(input)
      applyPatch((d) => patchAfterAccount(d, account))
    },
    updateAccount: async (
      id,
      patch,
    ) => {
      const account = await source.updateAccount!(id, patch)
      applyPatch((d) => patchAfterAccount(d, account))
    },
    deleteAccount: async (
      id,
      options,
    ) => {
      const result = await source.deleteAccount!(id, options)
      applyPatch((d) => patchAfterAccountDelete(d, id, result))
      return result
    },
  }
}
