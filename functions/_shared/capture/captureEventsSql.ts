import type { CaptureEvent } from '../../../src/domain/ports/captureRepository'

/**
 * The owner comes from the key row, and a revoked or unknown key selects no row. Only a clash on the replay index
 * is skipped: `INSERT OR IGNORE` would also swallow a null in a required column or a repeated id, and report a lost
 * push as a replay.
 */
export const RECORD_EVENT_SQL = `INSERT INTO capture_events
(id, owner, key_id, source, replay_key, kind, amount_cents, currency, merchant_raw, last4, account_digits,
 occurred_at, local_date, offset_minutes, received_at, rec_id, body_excerpt)
SELECT ?1, owner, key_id, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16
FROM capture_keys WHERE key_id = ?2 AND revoked_at IS NULL
ON CONFLICT (owner, source, replay_key) DO NOTHING`

/** Written in the same batch, and only when the event just above was stored, under the event's owner. */
export const RECORD_RECOMMENDATION_SQL = `INSERT INTO recommendations
(id, owner, account_id, amount_cents, currency, occurred_at, local_date, merchant_raw, description_suggested,
 suggested_type, created_at)
SELECT ?2, e.owner, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11
FROM capture_events e WHERE e.id = ?1 AND e.rec_id = ?2`

export function eventParams(e: CaptureEvent, recId: string | null): Array<string | number | null> {
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
  ]
}

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
