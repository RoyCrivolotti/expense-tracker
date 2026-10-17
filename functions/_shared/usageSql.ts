/**
 * The SQL behind `GET /api/expenses/usage` (`usageFromDataset` in `src/domain/engine/recordUsage.ts` is the
 * specification): how many records name each of the owner's categories, accounts, flags and labels.
 *
 * One statement, every part scoped to the owner. The transactions are counted in a single pass grouped by
 * category and account, which gives both counts; everything else is small (the owner's own plans,
 * statements, flags and labels, and the transactions that carry a flag or a label, found through the
 * indexes that name them). Each result row is `(kind, a, b, n)`:
 *
 *   cell       a = category  b = account   n = transactions
 *   category   a = id                      n = plans
 *   account    a = id        b = plans     n = statements
 *   flag       a = id                      n = transactions
 *   label      a = id                      n = transactions
 *
 * D1 allows at most five terms in a compound SELECT, and this uses all five (`usageSql.test.ts` fails on a
 * sixth): a deployed database refuses more with "too many terms in compound SELECT", which SQLite itself
 * does not.
 *
 * `+ 0` on the grouped columns of `transactions` is deliberate. Without it, once the planner has table
 * statistics it walks `idx_txn_category`, which has no owner in it, to get the groups in order, and reads
 * every owner's transactions to count one owner's. With it the only index that helps is the owner's.
 */
export const USAGE_SQL = `
SELECT 'cell' AS kind, category_id + 0 AS a, account_id + 0 AS b, count(*) AS n
FROM transactions WHERE owner = ?1 GROUP BY category_id + 0, account_id + 0
UNION ALL
SELECT 'category', c.id, NULL,
       (SELECT count(*) FROM installment_plans p WHERE p.owner = ?1 AND p.category_id = c.id)
FROM categories c WHERE c.owner = ?1
UNION ALL
SELECT 'account', a.id,
       (SELECT count(*) FROM installment_plans p WHERE p.owner = ?1 AND p.account_id = a.id),
       (SELECT count(*) FROM account_statements s WHERE s.owner = ?1 AND s.account_id = a.id)
FROM accounts a WHERE a.owner = ?1
UNION ALL
SELECT 'flag', f.id, NULL,
       (SELECT count(*) FROM transactions t WHERE t.owner = ?1 AND t.flag_id = f.id)
FROM flags f WHERE f.owner = ?1
UNION ALL
SELECT 'label', l.id, NULL, count(t.id)
FROM labels l
LEFT JOIN transaction_labels tl ON tl.label_id = l.id
LEFT JOIN transactions t ON t.id = tl.transaction_id AND t.owner = ?1
WHERE l.owner = ?1 GROUP BY l.id`

/** Terms in a compound SELECT, however its operators are spelled; D1 refuses more than five. */
export function compoundTerms(sql: string): number {
  return (sql.match(/\b(?:union|intersect|except)\b/gi) ?? []).length + 1
}

export const USAGE_COMPOUND_TERMS = compoundTerms(USAGE_SQL)

export interface UsageRow {
  kind: 'cell' | 'category' | 'account' | 'flag' | 'label'
  a: number
  b: number | null
  n: number
}
