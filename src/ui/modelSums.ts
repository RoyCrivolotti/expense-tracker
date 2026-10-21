import type { ExpenseDataset } from '../types'
import type { ExpenseModel } from './useExpenseData'

/**
 * The dataset for the engines that only add amounts: see `ExpenseModel.sums`.
 *
 * It lives apart from `buildExpenseModel` on purpose: the lazy tabs import it, and importing that module from them
 * makes the bundler split React DOM out of the entry chunk into one more file to load before the first paint.
 */
export function sumsOf(model: Pick<ExpenseModel, 'dataset' | 'sums'>): ExpenseDataset {
  return model.sums ?? model.dataset
}
