import { GROUP_WINDOW_MS } from '../../../src/domain/capture/grouping'
import { MALFORMED_SOURCE } from '../../../src/domain/capture/source'
import type { CaptureCaps, CaptureEvent } from '../../../src/domain/ports/captureEvents'

/**
 * The open recommendation of the key's owner that a push joins, by the rule of `sameMovement`: the same amount and
 * currency, at most `?25` seconds apart, and no event behind it of the push's template (`?23`) or shape (`?22`). The
 * nearest in time wins. `?26` and `?27` bound the stored text a day either side, so the index on `occurred_at` narrows
 * the read before the exact test, which needs `unixepoch` because the stored moment carries the phone's offset. Only a
 * push that brings a recommendation of its own (`?15`) looks for one to join.
 */
const OPEN_MOVEMENT = `(SELECT r.id FROM recommendations r
  WHERE ?15 IS NOT NULL AND r.owner = k.owner AND r.state = 'open' AND r.amount_cents = ?6 AND r.currency = ?7
  AND r.occurred_at >= ?26 AND r.occurred_at <= ?27
  AND abs(unixepoch(r.occurred_at) - unixepoch(?11)) <= ?25
  AND NOT EXISTS (SELECT 1 FROM capture_events f WHERE f.owner = r.owner AND f.rec_id = r.id
    AND (f.template_id = ?23 OR f.shape_id = ?22))
  ORDER BY abs(unixepoch(r.occurred_at) - unixepoch(?11)), r.id LIMIT 1)`

/**
 * The owner comes from the key row, and a revoked or unknown key selects no row. Only a clash on the replay index
 * is skipped: `INSERT OR IGNORE` would also swallow a null in a required column or a repeated id, and report a lost
 * push as a replay.
 *
 * The caps are part of the statement, because counting and then inserting lets parallel requests pass together.
 * A push over a cap stores nothing, exactly as a replay does, so a caller tells them apart with `HAS_EVENT_SQL`.
 *
 * Whether the push joins an open recommendation is decided here too, for the same reason: two pushes of one movement
 * that arrive at once run their batches one after the other, so the second finds the recommendation the first made.
 * The event then names that recommendation and is marked `grouped`, and `RECORD_RECOMMENDATION_SQL` makes none.
 */
export const RECORD_EVENT_SQL = `INSERT INTO capture_events
(id, owner, key_id, source, replay_key, kind, amount_cents, currency, merchant_raw, last4, account_digits,
 occurred_at, local_date, offset_minutes, received_at, rec_id, body, shape_id, template_id, slots, grouped)
SELECT ?1, owner, key_id, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, COALESCE(joined, ?15), ?16, ?22, ?23, ?24,
  joined IS NOT NULL
FROM (SELECT k.owner, k.key_id, ${OPEN_MOVEMENT} AS joined
  FROM capture_keys k WHERE k.key_id = ?2 AND k.revoked_at IS NULL
  AND (SELECT COUNT(*) FROM capture_events WHERE key_id = ?2 AND received_at >= ?17) < ?18
  AND (SELECT COUNT(*) FROM capture_events WHERE key_id = ?2 AND received_at >= ?19) < ?20
  AND (SELECT COUNT(*) FROM recommendations WHERE owner = k.owner AND state = 'open') < ?21)
WHERE true
ON CONFLICT (owner, source, replay_key) DO NOTHING`

/** Written in the same batch, and only when the event just above was stored and joined no recommendation. */
export const RECORD_RECOMMENDATION_SQL = `INSERT INTO recommendations
(id, owner, account_id, amount_cents, currency, occurred_at, local_date, merchant_raw, description_suggested,
 suggested_type, created_at)
SELECT ?2, e.owner, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11
FROM capture_events e WHERE e.id = ?1 AND e.rec_id = ?2`

/**
 * Run after the event, for a push that joined a recommendation and shows the merchant where its template says it sits
 * (`?2`): the recommendation takes that merchant when all it had was the whole body of an earlier push, or nothing.
 * Its own pushes tell the two apart: the description is a whole body when it is the start of one of their bodies.
 */
export const JOIN_MERCHANT_SQL = `UPDATE recommendations SET merchant_raw = ?2
WHERE owner = (SELECT owner FROM capture_events WHERE id = ?1)
AND id = (SELECT rec_id FROM capture_events WHERE id = ?1 AND grouped = 1) AND state = 'open'
AND (merchant_raw IS NULL OR EXISTS (SELECT 1 FROM capture_events f
  WHERE f.owner = recommendations.owner AND f.rec_id = recommendations.id AND f.id <> ?1
  AND f.body IS NOT NULL AND substr(f.body, 1, 200) = recommendations.merchant_raw))`

/** Run last in the batch: whether the event was stored, and whether it joined a recommendation. */
export const EVENT_GROUPED_SQL = 'SELECT grouped FROM capture_events WHERE id = ?1'

/** No cap: the writer of a test row, or any caller that has not been given limits. */
const NO_CAPS: CaptureCaps = {
  keyPerHour: Number.MAX_SAFE_INTEGER,
  keyPerDay: Number.MAX_SAFE_INTEGER,
  hourSince: '',
  daySince: '',
  openPerOwner: Number.MAX_SAFE_INTEGER,
}

export function eventParams(
  e: CaptureEvent,
  recId: string | null,
  caps: CaptureCaps = NO_CAPS,
  templateId: string | null = null,
): Array<string | number | null> {
  return [
    e.id,
    e.keyId,
    e.source,
    e.replayKey,
    e.kind,
    e.amountCents,
    e.currency,
    e.merchantRaw,
    e.last4,
    e.accountDigits,
    e.occurredAt,
    e.localDate,
    e.offsetMinutes,
    e.receivedAt,
    recId,
    e.body,
    caps.hourSince,
    caps.keyPerHour,
    caps.daySince,
    caps.keyPerDay,
    caps.openPerOwner,
    e.shapeId ?? null,
    templateId,
    e.slots ?? null,
    GROUP_WINDOW_MS / 1000,
    ...dayEitherSide(e.occurredAt),
  ]
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The stored moments a day before and after this one, as text: wider than any phone offset plus the window. */
function dayEitherSide(occurredAt: string): [string, string] {
  const at = Date.parse(occurredAt)
  if (Number.isNaN(at)) return ['', '']
  return [new Date(at - DAY_MS).toISOString(), new Date(at + DAY_MS).toISOString()]
}

/** The event's copies of a push's text. The recommendation's description is the person's, and is not among them. */
export const EVENT_TEXT_SET = 'body = NULL, body_excerpt = NULL, merchant_raw = NULL'
/** Written exactly as the partial index `idx_capture_events_text` is, so the planner can use it. */
export const EVENT_HAS_TEXT = '(body IS NOT NULL OR body_excerpt IS NOT NULL OR merchant_raw IS NOT NULL)'

/**
 * The 30-day rule: blanks the text of the key owner's pushes that arrived before `?2`. It reads only rows that still
 * hold text, through a partial index. `body_excerpt` is the column an older Worker wrote, blanked by the same rule.
 */
export const BLANK_OLD_TEXT_SQL = `UPDATE capture_events SET ${EVENT_TEXT_SET}
WHERE owner = (SELECT owner FROM capture_keys WHERE key_id = ?1) AND received_at < ?2
AND ${EVENT_HAS_TEXT}`

export const HAS_EVENT_SQL = `SELECT 1 AS found FROM capture_events e JOIN capture_keys k ON k.owner = e.owner
WHERE k.key_id = ?1 AND e.source = ?2 AND e.replay_key = ?3`

/**
 * The owner's distinct sources, less the word unreadable requests are counted under, which is not a source of theirs
 * and must not take one of their places.
 */
const OWNER_SOURCES = `(SELECT COUNT(DISTINCT source) FROM capture_counters WHERE owner = ?1 AND source <> '${MALFORMED_SOURCE}')`

/**
 * Counts a received push for the owner and day when neither the owner's total nor the global total for the day has
 * reached its cap, and the source is one the owner already has or the owner has room for another. The distinct-source
 * test sits in the same statement as the insert, so parallel requests with new words cannot pass it together.
 *
 * The owner's sum reads that owner's rows by the table's key, and the global sum scans the table, which holds about
 * two rows a day for one person. Add an index on `day` if the table ever grows enough for that scan to matter.
 */
export const ADMIT_SQL = `INSERT INTO capture_counters (owner, source, day, received)
SELECT ?1, ?2, ?3, 1
WHERE (SELECT COALESCE(SUM(received), 0) FROM capture_counters WHERE owner = ?1 AND day = ?3) < ?4
AND (SELECT COALESCE(SUM(received), 0) FROM capture_counters WHERE day = ?3) < ?5
AND (EXISTS (SELECT 1 FROM capture_counters WHERE owner = ?1 AND source = ?2)
  OR ${OWNER_SOURCES} < ?6)
ON CONFLICT (owner, source, day) DO UPDATE SET received = received + 1`

/** Run only after `ADMIT_SQL` stored nothing: a row when the refusal was the source cap, not a daily one. */
export const SOURCE_FULL_SQL = `SELECT 1 AS full WHERE NOT EXISTS (SELECT 1 FROM capture_counters WHERE owner = ?1 AND source = ?2)
AND ${OWNER_SOURCES} >= ?3`

export const EVENTS_SINCE_SQL = 'SELECT COUNT(*) AS n FROM capture_events WHERE key_id = ?1 AND received_at >= ?2'

export const LAST_CAPTURE_SQL = 'SELECT MAX(received_at) AS at FROM capture_events WHERE owner = ?1 AND source = ?2'

/** One statement per field: the column is part of the text, never built from a value. */
export const BUMP_COUNTER_SQL = {
  received: `INSERT INTO capture_counters (owner, source, day, received) VALUES (?1, ?2, ?3, 1)
ON CONFLICT (owner, source, day) DO UPDATE SET received = received + 1`,
  unrecognised: `INSERT INTO capture_counters (owner, source, day, unrecognised) VALUES (?1, ?2, ?3, 1)
ON CONFLICT (owner, source, day) DO UPDATE SET unrecognised = unrecognised + 1`,
  malformed: `INSERT INTO capture_counters (owner, source, day, malformed) VALUES (?1, ?2, ?3, 1)
ON CONFLICT (owner, source, day) DO UPDATE SET malformed = malformed + 1`,
} as const

export const READ_COUNTERS_SQL = `SELECT source, day, received, unrecognised, malformed FROM capture_counters
WHERE owner = ?1 AND day >= ?2 ORDER BY source, day`

export const SAVE_CARD_SQL = `INSERT INTO capture_cards (owner, source, digits_kind, digits, account_id)
VALUES (?1, ?2, ?3, ?4, ?5)
ON CONFLICT (owner, source, digits_kind, digits) DO UPDATE SET account_id = excluded.account_id`

export const LIST_CARDS_SQL = `SELECT source, digits_kind, digits, account_id FROM capture_cards
WHERE owner = ?1 ORDER BY source, digits_kind, digits`
