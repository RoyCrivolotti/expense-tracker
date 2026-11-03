/**
 * The SQL behind `GET /api/expenses/series`: the rows a series is made of, in the order `foldSeries`
 * (`seriesFold.ts`) reads them, which does the grouping the way `groupTransactions` in
 * `recurringDetect.ts` (the specification) does.
 *
 * A series is the rows that share (`description_norm`, account, category, type) and are neither
 * cancelled, blank, nor a plan's payment, when there are three or more of them. Grouping on the stored
 * `description_norm` and not on `lower(trim(description))` is what makes this exact for non-ASCII text.
 *
 * The statement only filters and orders. The index `idx_txn_owner_desc_norm` (owner, description_norm,
 * date) already holds the rows in the order the fold wants, so the statement is one walk of that index
 * with no sorter and no temporary table, and D1 bills each row once. Ranking the rows inside SQL
 * (window functions, then a group by) put four sorters between the index and the answer.
 */
export type SeriesTuple = [
  descriptionNorm: string,
  accountId: number,
  categoryId: number,
  type: 'expense' | 'income' | 'investment' | 'refund',
  date: string,
  id: number,
  budgetMonth: string,
  description: string,
  amountCents: number,
]

/**
 * ?1 owner. The planner takes `idx_txn_owner_desc_norm` for the range on `description_norm` and, because
 * the index already holds the rows in the `ORDER BY` order, adds no sorter. `seriesPlans.test.ts` holds the
 * plan to that with and without table statistics.
 */
export const SERIES_SQL = `
SELECT description_norm, account_id, category_id, type, date, id, budget_month, description, amount_cents
FROM transactions
WHERE owner = ?1 AND cancelled = 0 AND plan_id IS NULL AND description_norm > ''
ORDER BY description_norm, date, id`
