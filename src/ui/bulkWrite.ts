import type { WriteReach } from '../data/ledgerSession'
import type { ExpenseDataset } from '../types'

export type ApplyPatch = (patch: (dataset: ExpenseDataset) => ExpenseDataset, reach?: WriteReach) => void

/** The patch of a write whose answer says nothing about the rows it touched: the data is left as it is and told to read them again. */
export const unchanged = (dataset: ExpenseDataset): ExpenseDataset => dataset

/**
 * A write of many rows, which may have gone through in part (a request after the first can fail), so a
 * failure reads again what the ledger holds, as the list does. Its answer is shown by `apply`.
 */
export const bulkWriteOf =
  (applyPatch: ApplyPatch) =>
  async <R, T>(write: () => Promise<R>, apply: (result: R) => void, count: (result: R) => T): Promise<T> => {
    try {
      const result = await write()
      apply(result)
      return count(result)
    } catch (error) {
      applyPatch(unchanged, { patch: {} })
      throw error
    }
  }
