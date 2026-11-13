import { wasRefused } from '../data/apiClient'
import type { ExpenseDataSource, NewTransaction } from '../data/dataSource'
import { announceRecommendationsChanged, submitRecommendation } from '../data/recommendationsApi'
import type { ExpenseActions } from './actions'
import type { ApplyPatch } from './bulkWrite'
import { patchAfterBulkCreate, patchAfterTransactionCreate } from './datasetPatches'

/**
 * The actions that add rows. A captured payment is added by its own route, which creates the row and settles the
 * recommendation in one write, so it is told to any open list as soon as the row is in.
 */
export function createWrites(
  source: ExpenseDataSource,
  applyPatch: ApplyPatch,
  readAgain: (() => void) | undefined,
): Pick<ExpenseActions, 'createTransaction' | 'createTransactions' | 'submitRecommendation'> {
  return {
    createTransaction: async (input: NewTransaction) => {
      const txn = await source.createTransaction!(input)
      applyPatch((d) => patchAfterTransactionCreate(d, txn))
      return txn
    },
    submitRecommendation: async (id: string, input: NewTransaction, allowDuplicate?: boolean) => {
      const txn = await submitRecommendation(id, input, allowDuplicate)
      applyPatch((d) => patchAfterTransactionCreate(d, txn))
      announceRecommendationsChanged()
      return txn
    },
    createTransactions: async (inputs: NewTransaction[]) => {
      const txns = await source.createTransactions!(inputs).catch((error: unknown) => {
        if (!wasRefused(error)) readAgain?.()
        throw error
      })
      applyPatch((d) => patchAfterBulkCreate(d, txns))
    },
  }
}
