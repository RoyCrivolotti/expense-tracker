import type { CaptureEvent } from '../../../src/domain/ports/captureRepository'

/** The unique index on (owner, source, replay_key) makes a replayed push change nothing. */
export const RECORD_EVENT_SQL = `INSERT OR IGNORE INTO capture_events
(id, owner, key_id, source, replay_key, kind, amount_cents, currency, merchant_raw, last4, account_digits,
 occurred_at, local_date, offset_minutes, received_at, rec_id, body_excerpt)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`

export function eventParams(e: CaptureEvent): Array<string | number | null> {
  return [
    e.id,
    e.owner,
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
    e.recId,
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
