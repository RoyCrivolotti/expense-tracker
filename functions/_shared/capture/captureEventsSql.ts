import type { CaptureCaps, CaptureEvent } from '../../../src/domain/ports/captureRepository'

/**
 * The owner comes from the key row, and a revoked or unknown key selects no row. Only a clash on the replay index
 * is skipped: `INSERT OR IGNORE` would also swallow a null in a required column or a repeated id, and report a lost
 * push as a replay.
 *
 * The caps are part of the statement, because counting and then inserting lets parallel requests pass together.
 * A push over a cap stores nothing, exactly as a replay does, so a caller tells them apart with `HAS_EVENT_SQL`.
 */
export const RECORD_EVENT_SQL = `INSERT INTO capture_events
(id, owner, key_id, source, replay_key, kind, amount_cents, currency, merchant_raw, last4, account_digits,
 occurred_at, local_date, offset_minutes, received_at, rec_id, body_excerpt)
SELECT ?1, owner, key_id, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16
FROM capture_keys WHERE key_id = ?2 AND revoked_at IS NULL
AND (SELECT COUNT(*) FROM capture_events WHERE key_id = ?2 AND received_at >= ?17) < ?18
AND (SELECT COUNT(*) FROM capture_events WHERE key_id = ?2 AND received_at >= ?19) < ?20
AND (SELECT COUNT(*) FROM recommendations WHERE owner = capture_keys.owner AND state = 'open') < ?21
ON CONFLICT (owner, source, replay_key) DO NOTHING`

/** Written in the same batch, and only when the event just above was stored, under the event's owner. */
export const RECORD_RECOMMENDATION_SQL = `INSERT INTO recommendations
(id, owner, account_id, amount_cents, currency, occurred_at, local_date, merchant_raw, description_suggested,
 suggested_type, created_at)
SELECT ?2, e.owner, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11
FROM capture_events e WHERE e.id = ?1 AND e.rec_id = ?2`

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
    e.bodyExcerpt,
    caps.hourSince,
    caps.keyPerHour,
    caps.daySince,
    caps.keyPerDay,
    caps.openPerOwner,
  ]
}

export const HAS_EVENT_SQL = `SELECT 1 AS found FROM capture_events e JOIN capture_keys k ON k.owner = e.owner
WHERE k.key_id = ?1 AND e.source = ?2 AND e.replay_key = ?3`

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
  OR (SELECT COUNT(DISTINCT source) FROM capture_counters WHERE owner = ?1) < ?6)
ON CONFLICT (owner, source, day) DO UPDATE SET received = received + 1`

/** Run only after `ADMIT_SQL` stored nothing: a row when the refusal was the source cap, not a daily one. */
export const SOURCE_FULL_SQL = `SELECT 1 AS full WHERE NOT EXISTS (SELECT 1 FROM capture_counters WHERE owner = ?1 AND source = ?2)
AND (SELECT COUNT(DISTINCT source) FROM capture_counters WHERE owner = ?1) >= ?3`

export const EVENTS_SINCE_SQL = 'SELECT COUNT(*) AS n FROM capture_events WHERE key_id = ?1 AND received_at >= ?2'

export const LAST_CAPTURE_SQL = 'SELECT MAX(received_at) AS at FROM capture_events WHERE owner = ?1 AND source = ?2'

/** One statement per field: the column is part of the text, never built from a value. */
export const BUMP_COUNTER_SQL = {
  received: `INSERT INTO capture_counters (owner, source, day, received) VALUES (?1, ?2, ?3, 1)
ON CONFLICT (owner, source, day) DO UPDATE SET received = received + 1`,
  unrecognised: `INSERT INTO capture_counters (owner, source, day, unrecognised) VALUES (?1, ?2, ?3, 1)
ON CONFLICT (owner, source, day) DO UPDATE SET unrecognised = unrecognised + 1`,
} as const

export const READ_COUNTERS_SQL = `SELECT source, day, received, unrecognised FROM capture_counters
WHERE owner = ?1 AND day >= ?2 ORDER BY source, day`

export const SAVE_CARD_SQL = `INSERT INTO capture_cards (owner, source, digits_kind, digits, account_id)
VALUES (?1, ?2, ?3, ?4, ?5)
ON CONFLICT (owner, source, digits_kind, digits) DO UPDATE SET account_id = excluded.account_id`

export const LIST_CARDS_SQL = `SELECT source, digits_kind, digits, account_id FROM capture_cards
WHERE owner = ?1 ORDER BY source, digits_kind, digits`
