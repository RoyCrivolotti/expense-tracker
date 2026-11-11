import type { CaptureKey, CaptureKeySummary, NewCaptureKey } from '../../../src/domain/ports/captureRepository'
import { MAX_ACTIVE_CAPTURE_KEYS } from '../../../src/domain/ports/captureRepository'

/**
 * The cap is checked inside the insert, not read first, so two requests made at once cannot both pass it. The
 * limit is a literal in the text and not a bound value so the statement is the same for every caller.
 */
export const CREATE_KEY_SQL = `INSERT INTO capture_keys (key_id, owner, label, secret_hash, created_at)
SELECT ?1, ?2, ?3, ?4, ?5
WHERE (SELECT COUNT(*) FROM capture_keys WHERE owner = ?2 AND revoked_at IS NULL) < ${MAX_ACTIVE_CAPTURE_KEYS}`

export const FIND_KEY_SQL =
  'SELECT key_id, owner, label, secret_hash, created_at, last_used_at, revoked_at FROM capture_keys WHERE key_id = ?1'

export const LIST_KEYS_SQL = `SELECT key_id, label, created_at, last_used_at FROM capture_keys
WHERE owner = ?1 AND revoked_at IS NULL ORDER BY created_at DESC, key_id DESC`

export const REVOKE_KEY_SQL =
  'UPDATE capture_keys SET revoked_at = ?3 WHERE key_id = ?2 AND owner = ?1 AND revoked_at IS NULL'

/** A write per accepted push would make the busiest key the costliest, so a use is recorded once a minute. */
export const TOUCH_KEY_SQL = `UPDATE capture_keys SET last_used_at = ?2
WHERE key_id = ?1 AND revoked_at IS NULL AND (last_used_at IS NULL OR last_used_at <= ?3)`

export const TOUCH_INTERVAL_MS = 60_000

export interface KeyRow {
  key_id: string
  owner: string
  label: string
  secret_hash: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export function keyParams(k: NewCaptureKey): [string, string, string, string, string] {
  return [k.keyId, k.owner, k.label, k.secretHash, k.createdAt]
}

export function toSummary(row: Pick<KeyRow, 'key_id' | 'label' | 'created_at' | 'last_used_at'>): CaptureKeySummary {
  return {
    keyId: row.key_id,
    label: row.label,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }
}

export function toKey(row: KeyRow): CaptureKey {
  return {
    ...toSummary(row),
    owner: row.owner,
    secretHash: row.secret_hash,
    revokedAt: row.revoked_at,
  }
}

/** The instant a previous use must not be later than for a new one to be recorded. */
export function touchCutoff(at: string): string {
  return new Date(Date.parse(at) - TOUCH_INTERVAL_MS).toISOString()
}
