import type { ExpenseDataset } from '../types'
import { sortedMonths } from '../engine/dates'
import { buildDescriptionIndex } from '../data/descriptionIndex'
import { buildLookup } from './format'
import type { ExpenseModel } from './useExpenseData'

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
