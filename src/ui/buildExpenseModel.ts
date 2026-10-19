import type { ExpenseDataset } from '../types'
import { sortedMonths } from '../engine/dates'
import { buildDescriptionIndex } from '../data/descriptionIndex'
import { buildLookup } from './format'
import type { ExpenseModel } from './useExpenseData'

/** The dataset for the engines that only add amounts: see `ExpenseModel.sums`. */
export function sumsOf(model: Pick<ExpenseModel, 'dataset' | 'sums'>): ExpenseDataset {
  return model.sums ?? model.dataset
}

/** Build the in-memory view model from a normalized dataset. */
export function buildExpenseModel(dataset: ExpenseDataset): ExpenseModel {
  const months = sortedMonths(dataset.transactions.map((t) => t.budgetMonth))
  return {
    dataset,
    lookup: buildLookup(dataset),
    descriptionIndex: buildDescriptionIndex(dataset.transactions),
    months,
  }
}
