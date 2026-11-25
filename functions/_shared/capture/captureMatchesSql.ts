/**
 * The typed rows that could be the same payment as any of a page of recommendations, in one read. The date range is
 * the span of the page widened by the match window (further forward for an announced bill), and the amounts are the
 * page's own, so only rows of a price that is waiting come back. The rest of the rule (direction, the window per
 * payment, the closest) is `possibleMatchFor`, which also decides for the submit-time check.
 *
 * A row is left out here when it is cancelled. A row a recommendation of the person already answers for (linked, or
 * made by submitting one) comes back with that recommendation's two dates, so `mayAnswerBoth` can keep a payment that
 * was captured and added from matching the next push of the same price, and still offer a bill added from its
 * announcement to the push that reports the charge. A row answers for at most one recommendation (the unique index),
 * so the join adds no rows. The owner is in the statement, never taken from a row.
 *
 * Newest first, so a cap, should it ever be reached, drops the oldest rows and not the ones nearest the payments.
 *
 * The amounts travel as one JSON value, since a statement binds at most 100 values.
 */
export const MATCH_CANDIDATES_SQL = `SELECT t.id, t.date, t.description, t.type, t.amount_cents,
r.occurred_at AS answers_occurred_at, r.local_date AS answers_local_date
FROM transactions t
LEFT JOIN recommendations r ON r.owner = ?1 AND r.txn_id = t.id
WHERE t.owner = ?1 AND t.date >= ?2 AND t.date <= ?3 AND t.cancelled = 0
AND ABS(t.amount_cents) IN (SELECT value FROM json_each(?4))
ORDER BY t.date DESC, t.id DESC
LIMIT 2000`
