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

export async function findRequestByTokenHashRow(
  db: D1Database,
  tokenHash: string,
): Promise<AccessRequest | null> {
  const row = await db
    .prepare('SELECT * FROM access_requests WHERE token_hash = ?')
    .bind(tokenHash)
    .first<AccessRequestRow>()
  return row ? toAccessRequest(row) : null
}

export async function insertAccessRequest(
  db: D1Database,
  input: { id: string; email: string; tokenHash: string; expiresAt: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO access_requests (id, email, token_hash, expires_at, status)
       VALUES (?, ?, ?, ?, 'pending')`,
    )
    .bind(input.id, input.email, input.tokenHash, input.expiresAt)
    .run()
}

export async function markRequestApprovedRow(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE access_requests SET status = 'approved' WHERE id = ?")
    .bind(id)
    .run()
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
