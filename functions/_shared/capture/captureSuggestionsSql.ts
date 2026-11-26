/*
 * What the list of recommendations reads to suggest what each payment becomes. One statement per table for a whole
 * page, with the page's ids and keys as one JSON value each, since a statement binds at most 100 values.
 */

/**
 * The slots of the push behind each recommendation of a page, and what its template has learned. A recommendation
 * with several pushes is read through the one that made it, the push learning teaches. `known` is null when the push has
 * no template or it was evicted. `body` is that push's stored text, null once it is blanked. A recommendation no push made has no row. The page's ids drive the read (`CROSS JOIN`
 * keeps that order), so it never walks the person's other events.
 */
export const SUGGESTION_EVENTS_SQL = `SELECT j.value AS rec_id, e.slots, e.body, t.template_id AS known, t.accepts, t.dismissals,
t.dismiss_streak, t.amount_slot, t.amount_mark, t.type, t.account_id, t.ignored_at
FROM json_each(?2) j
CROSS JOIN capture_events e
LEFT JOIN capture_templates t ON t.owner = ?1 AND t.template_id = e.template_id
WHERE e.owner = ?1
AND e.id = (SELECT id FROM capture_events WHERE owner = ?1 AND rec_id = j.value ORDER BY grouped, received_at, id LIMIT 1)`

/** Every row the person holds for the given merchant keys, at any price and at each one. */
export const MERCHANT_ROWS_SQL = `SELECT key, amount_cents, description, category_id, votes, last_seen FROM capture_merchants
WHERE owner = ?1 AND key IN (SELECT value FROM json_each(?2))`
