import { MAX_PUSH_DEVICES, type NewPushSubscription, type PushDevice, type PushSettings } from '../../../src/domain/ports/pushRepository'

/**
 * The cap is checked inside the insert, so two devices saved at once cannot both pass it, and it counts the owner's
 * other endpoints only, so refreshing a stored device never hits it. The endpoint is unique: saving one already stored
 * refreshes that row for whoever is signed in on the device, keeps its id and its first save and last send times, and
 * forgets the last send's status, which was about keys that may have changed.
 */
export const SAVE_SUBSCRIPTION_SQL = `INSERT INTO push_subscriptions (id, owner, endpoint, p256dh, auth, label, created_at)
SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
WHERE (SELECT COUNT(*) FROM push_subscriptions WHERE owner = ?2 AND endpoint <> ?3) < ${MAX_PUSH_DEVICES}
ON CONFLICT(endpoint) DO UPDATE SET owner = excluded.owner, p256dh = excluded.p256dh, auth = excluded.auth,
  label = excluded.label, last_status = NULL`

export const ID_OF_ENDPOINT_SQL = 'SELECT id FROM push_subscriptions WHERE endpoint = ?1'

export const LIST_DEVICES_SQL = `SELECT id, label, created_at, last_sent_at, last_status FROM push_subscriptions
WHERE owner = ?1 ORDER BY created_at DESC, id DESC`

export const DELETE_SUBSCRIPTION_SQL = 'DELETE FROM push_subscriptions WHERE owner = ?1 AND id = ?2'

export const GET_SETTINGS_SQL = 'SELECT mode, time_zone, last_summary_at FROM push_settings WHERE owner = ?1'

export const SAVE_SETTINGS_SQL = `INSERT INTO push_settings (owner, mode, time_zone) VALUES (?1, ?2, ?3)
ON CONFLICT(owner) DO UPDATE SET mode = excluded.mode, time_zone = excluded.time_zone`

export const SAVE_SETTINGS_IF_MISSING_SQL = 'INSERT OR IGNORE INTO push_settings (owner, mode, time_zone) VALUES (?1, ?2, ?3)'

export function subscriptionParams(s: NewPushSubscription): [string, string, string, string, string, string, string] {
  return [s.id, s.owner, s.endpoint, s.p256dh, s.auth, s.label, s.createdAt]
}

export interface DeviceRow {
  id: string
  label: string
  created_at: string
  last_sent_at: string | null
  last_status: number | null
}

export const toDevice = (row: DeviceRow): PushDevice => ({
  id: row.id,
  label: row.label,
  createdAt: row.created_at,
  lastSentAt: row.last_sent_at,
  lastStatus: row.last_status,
})

export interface SettingsRow {
  mode: PushSettings['mode']
  time_zone: string
  last_summary_at: string | null
}

export const toSettings = (row: SettingsRow): PushSettings => ({ mode: row.mode, timeZone: row.time_zone, lastSummaryAt: row.last_summary_at })
