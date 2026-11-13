/**
 * The typed rows that could be the same payment as any of a page of recommendations, in one read. The date range is
 * the span of the page widened by the match window, and the amounts are the page's own, so only rows of a price that
 * is waiting come back. The rest of the rule (direction, the window per payment, the closest) is
 * `possibleMatchFor`, which also decides for the submit-time check.
 *
 * A row is left out here when it is cancelled, and when any recommendation of the person already answers for it
 * (linked by hand, or made by submitting one), so a payment that was captured and added does not match the next push
 * of the same price. The owner is in the statement, never taken from a row.
 *
 * The amounts travel as one JSON value, since a statement binds at most 100 values.
 */
export const MATCH_CANDIDATES_SQL = `SELECT t.id, t.date, t.description, t.type, t.amount_cents
FROM transactions t
WHERE t.owner = ?1 AND t.date >= ?2 AND t.date <= ?3 AND t.cancelled = 0
AND ABS(t.amount_cents) IN (SELECT value FROM json_each(?4))
AND NOT EXISTS (SELECT 1 FROM recommendations r WHERE r.owner = ?1 AND r.txn_id = t.id)
ORDER BY t.date, t.id
LIMIT 2000`
