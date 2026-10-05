import type { ExpenseModel } from '../useExpenseData'
import type { AnalyticsBasis, CategoryActuals } from '../../engine'
import { basisOptions, computeCategoryActuals } from '../../engine'

function hasActivity(r: CategoryActuals): boolean {
  for (const cents of r.byMonth.values()) if (cents !== 0) return true
  return false
}

/**
 * The grid's rows — budgeted or active categories, in the user's sort order.
 * The CSV export shares this so the file is the grid, not a near-miss of it.
 */
export function monthlySummaryRows(
  model: ExpenseModel,
  month: string,
  basis: AnalyticsBasis,
): CategoryActuals[] {
  const { dataset } = model
  const order = new Map(dataset.categories.map((c) => [c.id, c.sortOrder]))
  return computeCategoryActuals(dataset.transactions, dataset.categories, {
    ...basisOptions(basis),
    ytdThroughMonth: month,
  })
    .filter((r) => r.monthlyBudgetCents > 0 || hasActivity(r))
    .sort((a, b) => (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0))
}
