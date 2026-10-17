/**
 * The SQL behind `GET /api/expenses/descriptions/suggest`: the newest row of each description that
 * starts with a prefix, among rows booked in months before `before`. `buildDescriptionIndex` in the
 * browser is the specification (`src/data/descriptionIndex.ts`): a cancelled row is out, a description
 * is its normalized text, and the row that speaks for it is the newest by date, then id.
 *
 * It reads the index `(owner, description_norm, date)` by skipping from one description to the next
 * rather than walking every row of the prefix. A recursive query finds the first matching description,
 * then the first one after it, and so on, each a single seek. The walk takes every description of the
 * owner in the range and puts no other condition on it: a condition on the status or the month would make
 * each step read, one table row at a time, every row of the descriptions it has to skip. A second seek per
 * description then finds its newest eligible row, which reads the rows of that description booked from
 * `before` on (the ones the browser holds) before it reaches an eligible one, and a description with no
 * eligible row comes back with nothing in it. So the rows read are a few per matching description plus
 * those, and the walk stops at one past the cap of descriptions. Ordering the matches is not done here:
 * SQLite cannot sort as the browser's collator does, so the Worker sorts the (bounded) result.
 */
import { prefixUpperBound } from '../domain/engine/descriptionSearch'

export interface SuggestSql {
  sql: string
  params: Array<string | number>
}

/**
 * `cap` is the most descriptions to walk; one past the limit the caller will accept tells it there
 * were too many. With no upper end (a prefix of nothing but the last code point) every string from the
 * prefix up starts with it, so the range is open at the top and still exact. The result has one row per
 * description walked, and the columns after `description_norm` are NULL for one with no eligible row.
 */
export function suggestSql(owner: string, prefix: string, before: string | undefined, cap: number): SuggestSql {
  const upper = prefixUpperBound(prefix)
  const params: Array<string | number> = [owner, prefix]
  const upperIn = upper !== null ? params.push(upper) : 0
  const beforeIn = before !== undefined ? params.push(before) : 0
  const capIn = params.push(cap)
  const upperAnd = upperIn ? ` AND description_norm < ?${upperIn}` : ''
  // The `+` keeps the planner on this description's entries: left alone it prefers the budget month index and
  // reads every row of the owner before the month, once per description.
  const beforeAnd = beforeIn ? ` AND +budget_month < ?${beforeIn}` : ''
  const sql = `
WITH RECURSIVE keys(k) AS (
  SELECT min(description_norm) FROM transactions
   WHERE owner = ?1 AND description_norm >= ?2${upperAnd}
  UNION ALL
  SELECT (SELECT min(description_norm) FROM transactions
           WHERE owner = ?1 AND description_norm > keys.k${upperAnd})
  FROM keys WHERE k IS NOT NULL
  LIMIT ?${capIn}
)
SELECT keys.k AS description_norm, t.description, t.type, t.category_id, t.account_id, t.date, t.id
FROM keys
LEFT JOIN transactions t ON t.id = (
  SELECT id FROM transactions
   WHERE owner = ?1 AND description_norm = keys.k AND cancelled = 0${beforeAnd}
   ORDER BY date DESC, id DESC LIMIT 1)
WHERE keys.k IS NOT NULL`
  return { sql, params }
}

/** A description walked, with the newest eligible row of it, or with every other field null when it has none. */
export interface SuggestRow {
  description_norm: string
  description: string | null
  type: 'expense' | 'income' | 'investment' | 'refund' | null
  category_id: number | null
  account_id: number | null
  date: string | null
  id: number | null
}
