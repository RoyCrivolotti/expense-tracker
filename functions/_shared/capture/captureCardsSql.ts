import { MAX_CAPTURE_CARDS } from '../../../src/domain/ports/captureRepository'

/**
 * The events of one card or account, as the recommendations they made: a recommendation's `id` is its event's
 * `rec_id`. An event holds the digits in `last4` for a card and in `account_digits` for an account.
 */
const EVENTS_OF_THESE_DIGITS = `id IN (SELECT rec_id FROM capture_events WHERE owner = ?1 AND source = ?2
  AND rec_id IS NOT NULL AND ((?3 = 'card' AND last4 = ?4) OR (?3 = 'account' AND account_digits = ?4)))`

/**
 * Saves the link. The account must be the owner's and the owner must be under the cap, both inside the insert so
 * parallel requests cannot pass them together. A link that exists is always allowed, so saving it again at the cap still
 * works. The limit is a literal so the statement is the same for every caller.
 */
export const LINK_CARD_SQL = `INSERT INTO capture_cards (owner, source, digits_kind, digits, account_id)
SELECT ?1, ?2, ?3, ?4, ?5
WHERE EXISTS (SELECT 1 FROM accounts WHERE id = ?5 AND owner = ?1)
AND ((SELECT COUNT(*) FROM capture_cards WHERE owner = ?1) < ${MAX_CAPTURE_CARDS}
  OR EXISTS (SELECT 1 FROM capture_cards WHERE owner = ?1 AND source = ?2 AND digits_kind = ?3 AND digits = ?4))
ON CONFLICT (owner, source, digits_kind, digits) DO UPDATE SET account_id = excluded.account_id`

/**
 * Written in the same batch, so the open recommendations these digits made take the account at once and the next list
 * shows it, rather than the account the push found when it arrived (none, or the one that was linked then). Only when
 * the link above is now there.
 */
export const POINT_OPEN_AT_LINK_SQL = `UPDATE recommendations SET account_id = ?5
WHERE owner = ?1 AND state = 'open' AND (account_id IS NULL OR account_id <> ?5)
AND EXISTS (SELECT 1 FROM capture_cards WHERE owner = ?1 AND source = ?2 AND digits_kind = ?3 AND digits = ?4 AND account_id = ?5)
AND ${EVENTS_OF_THESE_DIGITS}`

export const UNLINK_CARD_SQL =
  'DELETE FROM capture_cards WHERE owner = ?1 AND source = ?2 AND digits_kind = ?3 AND digits = ?4'

/** Written after the delete: open recommendations from these digits are not mapped any more. */
export const CLEAR_OPEN_OF_UNLINKED_SQL = `UPDATE recommendations SET account_id = NULL
WHERE owner = ?1 AND state = 'open' AND account_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM capture_cards WHERE owner = ?1 AND source = ?2 AND digits_kind = ?3 AND digits = ?4)
AND ${EVENTS_OF_THESE_DIGITS}`

export const ACCOUNT_EXISTS_SQL = 'SELECT 1 AS found FROM accounts WHERE id = ?2 AND owner = ?1'

/**
 * The cards open recommendations are waiting on: digits a push showed with no account to put them in, because there is
 * no link or the linked account has been deleted. One row per card, with how many payments wait on it.
 */
export const WAITING_CARDS_SQL = `SELECT e.source AS source, e.last4 AS digits, COUNT(*) AS n
FROM recommendations r JOIN capture_events e ON e.rec_id = r.id AND e.owner = r.owner
WHERE r.owner = ?1 AND r.state = 'open' AND e.last4 IS NOT NULL
AND (r.account_id IS NULL OR NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = r.account_id AND a.owner = r.owner))
GROUP BY e.source, e.last4 ORDER BY e.source, e.last4`

/** The card each of a page of recommendations came from. The ids travel as one JSON value, since a statement binds at most 100. */
export const CARDS_OF_RECOMMENDATIONS_SQL = `SELECT rec_id, source, last4 FROM capture_events
WHERE owner = ?1 AND last4 IS NOT NULL AND rec_id IN (SELECT value FROM json_each(?2))`
