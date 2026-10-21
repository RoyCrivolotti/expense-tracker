/**
 * The two readings the Spending view makes of the model, apart from the view so that a test can run them
 * over a model that holds every row and over one that holds a window, and compare them.
 */
import type { ExpenseModel } from '../../useExpenseData'
import { sumsOf } from '../../modelSums'
import type { AnalyticsBasis, SpendingGroupBy } from '../../../engine'
import { classifierFromGroups, computeSpendingGroupDetail, computeSpendingGroups } from '../../../engine'

export interface SpendingQuery {
  month: string
  basis: AnalyticsBasis
  groupBy: SpendingGroupBy
  today: string
  /** The budget month `today` falls in (rollover-aware). */
  openMonth: string
}

/**
 * The groups and their detail add a 12 month trend of sums beside the rows of the viewed month, so they
 * read the model's sums, with the classifier of the whole history when the model has only part of it.
 */
function source(model: ExpenseModel) {
  return {
    transactions: sumsOf(model).transactions,
    categories: model.dataset.categories,
    ...(model.history ? { classifier: classifierFromGroups(model.history.groups) } : {}),
  }
}

export function spendingRows(model: ExpenseModel, query: SpendingQuery) {
  return computeSpendingGroups(
    { ...source(model), labels: model.dataset.labels },
    { ...query, months: model.months, rolloverDay: model.dataset.settings.budgetRolloverDay },
  )
}

export function spendingDetail(model: ExpenseModel, query: SpendingQuery & { months: string[]; key: string }) {
  return computeSpendingGroupDetail(source(model), {
    ...query,
    rolloverDay: model.dataset.settings.budgetRolloverDay,
  })
}
