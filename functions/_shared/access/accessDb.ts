import type {
  AccessRequest,
  AllowedUser,
} from '../../domain/ports/accessRepository'

interface AllowedUserRow {
  email: string
  status: string
  granted_at: string
  granted_by: string | null
  last_seen_at: string | null
}

interface AccessRequestRow {
  id: string
  email: string
  requested_at: string
  status: string
  token_hash: string
  expires_at: string
}

function toAllowedUser(row: AllowedUserRow): AllowedUser {
  return {
    email: row.email,
    status: row.status as AllowedUser['status'],
    grantedAt: row.granted_at,
    grantedBy: row.granted_by,
    lastSeenAt: row.last_seen_at,
  }
}

function toAccessRequest(row: AccessRequestRow): AccessRequest {
  return {
    id: row.id,
    email: row.email,
    requestedAt: row.requested_at,
    status: row.status as AccessRequest['status'],
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
  }
}

export async function countActiveUsers(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM allowed_users WHERE status = 'active'")
    .first<{ n: number }>()
  return row?.n ?? 0
}

export async function isAllowedUser(db: D1Database, email: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ok FROM allowed_users WHERE email = ? AND status = 'active'")
    .bind(email)
    .first<{ ok: number }>()
  return Boolean(row?.ok)
}

export async function getAllowedUserRow(
  db: D1Database,
  email: string,
): Promise<AllowedUser | null> {
  const row = await db
    .prepare('SELECT * FROM allowed_users WHERE email = ?')
    .bind(email)
    .first<AllowedUserRow>()
  return row ? toAllowedUser(row) : null
}

export async function listActiveUserRows(db: D1Database): Promise<AllowedUser[]> {
  const result = await db
    .prepare("SELECT * FROM allowed_users WHERE status = 'active' ORDER BY email")
    .all<AllowedUserRow>()
  return (result.results ?? []).map(toAllowedUser)
}

export async function upsertAllowedUser(
  db: D1Database,
  email: string,
  grantedBy: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO allowed_users (email, status, granted_at, granted_by)
       VALUES (?, 'active', datetime('now'), ?)
       ON CONFLICT(email) DO UPDATE SET
         status = 'active',
         granted_at = datetime('now'),
         granted_by = excluded.granted_by`,
    )
    .bind(email, grantedBy)
    .run()
}

export async function findPendingRequestRow(
  db: D1Database,
  email: string,
): Promise<AccessRequest | null> {
  const row = await db
    .prepare(
      "SELECT * FROM access_requests WHERE email = ? AND status = 'pending' ORDER BY requested_at DESC LIMIT 1",
    )
    .bind(email)
    .first<AccessRequestRow>()
  return row ? toAccessRequest(row) : null
}

export async function listPendingRequestRows(db: D1Database): Promise<AccessRequest[]> {
  const result = await db
    .prepare("SELECT * FROM access_requests WHERE status = 'pending' ORDER BY requested_at ASC")
    .all<AccessRequestRow>()
  return (result.results ?? []).map(toAccessRequest)
}

export async function countPendingRequestRows(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM access_requests WHERE status = 'pending'")
    .first<{ n: number }>()
  return row?.n ?? 0
}

export async function findRequestByIdRow(
  db: D1Database,
  id: string,
): Promise<AccessRequest | null> {
  const row = await db
    .prepare('SELECT * FROM access_requests WHERE id = ?')
    .bind(id)
    .first<AccessRequestRow>()
  return row ? toAccessRequest(row) : null
}

export async function insertAccessRequest(
  db: D1Database,
  input: { id: string; email: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO access_requests (id, email, token_hash, expires_at, status)
       VALUES (?, ?, ?, datetime('now', '+1 year'), 'pending')`,
    )
    .bind(input.id, input.email, input.id)
    .run()
}

export async function markRequestApprovedRow(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE access_requests SET status = 'approved' WHERE id = ?")
    .bind(id)
    .run()
}

export async function markRequestRejectedRow(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE access_requests SET status = 'rejected' WHERE id = ?")
    .bind(id)
    .run()
}

export async function findLatestRequestByEmailRow(
  db: D1Database,
  email: string,
): Promise<AccessRequest | null> {
  const row = await db
    .prepare('SELECT * FROM access_requests WHERE email = ? ORDER BY requested_at DESC LIMIT 1')
    .bind(email)
    .first<AccessRequestRow>()
  return row ? toAccessRequest(row) : null
}

export async function revokeAllowedUserRow(db: D1Database, email: string): Promise<boolean> {
  const result = await db
    .prepare("UPDATE allowed_users SET status = 'revoked' WHERE email = ? AND status = 'active'")
    .bind(email)
    .run()
  return (result.meta.changes ?? 0) > 0
}

export async function touchLastSeenRow(
  db: D1Database,
  email: string,
  seenAt: string,
): Promise<void> {
  await db
    .prepare('UPDATE allowed_users SET last_seen_at = ? WHERE email = ?')
    .bind(seenAt, email)
    .run()
}

export async function listGroupGrantIds(db: D1Database, email: string): Promise<string[]> {
  const result = await db
    .prepare('SELECT group_id FROM user_group_grants WHERE email = ?')
    .bind(email)
    .all<{ group_id: string }>()
  return (result.results ?? []).map((row) => row.group_id)
}

export async function grantGroupRow(
  db: D1Database,
  email: string,
  groupId: string,
  grantedBy: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO user_group_grants (email, group_id, granted_at, granted_by)
       VALUES (?, ?, datetime('now'), ?)
       ON CONFLICT(email, group_id) DO UPDATE SET
         granted_at = datetime('now'),
         granted_by = excluded.granted_by`,
    )
    .bind(email, groupId, grantedBy)
    .run()
}

export async function revokeGroupRow(
  db: D1Database,
  email: string,
  groupId: string,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM user_group_grants WHERE email = ? AND group_id = ?')
    .bind(email, groupId)
    .run()
  return (result.meta.changes ?? 0) > 0
}

export async function revokeAllGroupRows(db: D1Database, email: string): Promise<void> {
  await db.prepare('DELETE FROM user_group_grants WHERE email = ?').bind(email).run()
}
