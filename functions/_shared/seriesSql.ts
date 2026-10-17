/**
 * The SQL behind `GET /api/expenses/series`: the owner's recurring series in the shape of
 * `RecurringSeries` (`src/domain/engine/recurringSeries.ts`, whose comment says what each column is for).
 *
 * A series is the rows that share (`description_norm`, account, category, type) and are neither
 * cancelled, blank, nor a plan's payment, when there are three or more of them: `groupTransactions`
 * in `recurringDetect.ts` is the specification. Grouping on the stored `description_norm` and not on
 * `lower(trim(description))` is what makes this exact for non-ASCII text.
 *
 * One pass over the owner's counted rows: window functions rank each row within its series and take
 * the gap to the row before it, and the outer query folds each series into one result row. The result
 * has one row per series, with the gaps and dates as comma separated text, so the Worker does not
 * build an object per transaction.
 */
import { SERIES_TAIL_DATES, SERIES_TAIL_OFFSETS } from '../domain/engine/recurringSeries'

export interface SeriesRow {
  account_id: number
  category_id: number
  type: 'expense' | 'income' | 'investment' | 'refund'
  label: string
  amount_cents: number
  newest_dates: string
  older_gaps: string | null
  budget_months: string
  offsets: string
}

const KEY = 'description_norm, account_id, category_id, type'

/** ?1 owner, ?2 how many newest dates a series keeps, ?3 how many newest offsets. */
export const SERIES_SQL = `
WITH counted AS (
  SELECT ${KEY}, date, id, budget_month, description, amount_cents,
         row_number() OVER newest AS age,
         CAST(julianday(date) - julianday(lag(date) OVER oldest) AS INTEGER) AS gap,
         (CAST(substr(budget_month, 1, 4) AS INTEGER) * 12 + CAST(substr(budget_month, 6, 2) AS INTEGER))
           - (CAST(substr(date, 1, 4) AS INTEGER) * 12 + CAST(substr(date, 6, 2) AS INTEGER)) AS months_ahead
  FROM transactions
  WHERE owner = ?1 AND cancelled = 0 AND plan_id IS NULL AND description_norm > ''
  WINDOW newest AS (PARTITION BY ${KEY} ORDER BY date DESC, id DESC),
         oldest AS (PARTITION BY ${KEY} ORDER BY date, id)
)
SELECT account_id, category_id, type,
       max(CASE WHEN age = 1 THEN description END) AS label,
       max(CASE WHEN age = 1 THEN amount_cents END) AS amount_cents,
       max(CASE WHEN age = 1 THEN date END) AS newest_date,
       max(CASE WHEN age = 1 THEN id END) AS newest_id,
       group_concat(CASE WHEN age <= ?2 THEN date END) AS newest_dates,
       group_concat(CASE WHEN age >= ?2 THEN gap END) AS older_gaps,
       group_concat(DISTINCT budget_month) AS budget_months,
       group_concat(CASE WHEN age <= ?3 THEN months_ahead END) AS offsets
FROM counted
GROUP BY ${KEY}
HAVING count(*) >= 3
ORDER BY newest_date DESC, newest_id DESC`

export const SERIES_PARAMS = (owner: string): [string, number, number] => [owner, SERIES_TAIL_DATES, SERIES_TAIL_OFFSETS]
