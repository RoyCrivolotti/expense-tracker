import type { AccessState } from './inMemoryAccessDb'
import { NOW, asEmail } from './inMemoryAccessDb'

export function runMutation(
  sql: string,
  state: AccessState,
  args: unknown[],
): { meta: { changes: number } } {
  if (sql.includes('INSERT INTO allowed_users')) return insertAllowedUser(state, args)
  if (sql.includes('UPDATE allowed_users SET status =')) return revokeAllowedUser(state, args)
  if (sql.includes('UPDATE allowed_users SET last_seen_at')) return touchLastSeen(state, args)
  if (sql.includes('INSERT INTO user_group_grants')) return insertGroupGrant(state, args)
  if (sql.includes('DELETE FROM user_group_grants WHERE email = ? AND group_id = ?')) {
    return deleteGroupGrant(state, args)
  }
  if (sql.includes('DELETE FROM user_group_grants WHERE email = ?')) return deleteAllGroupGrants(state, args)
  if (sql.includes('INSERT INTO access_requests')) return insertAccessRequest(state, args)
  if (sql.includes("SET status = 'approved'")) return setRequestStatus(state, args, 'approved')
  if (sql.includes("SET status = 'rejected'")) return setRequestStatus(state, args, 'rejected')
  if (sql.includes('DELETE FROM transactions WHERE owner = ?')) return purgeTransactions(state, args)
  if (sql.includes('DELETE FROM')) return { meta: { changes: 0 } }
  throw new Error(`inMemoryAccessDb: unsupported mutation: ${sql}`)
}

function insertAllowedUser(state: AccessState, args: unknown[]) {
  const email = asEmail(args[0])
  state.users.set(email, {
    email,
    status: 'active',
    granted_at: NOW,
    granted_by: args[1] == null ? null : asEmail(args[1]),
    last_seen_at: null,
  })
  return { meta: { changes: 1 } }
}

function revokeAllowedUser(state: AccessState, args: unknown[]) {
  const row = state.users.get(asEmail(args[0]))
  if (!row || row.status !== 'active') return { meta: { changes: 0 } }
  row.status = 'revoked'
  return { meta: { changes: 1 } }
}

function touchLastSeen(state: AccessState, args: unknown[]) {
  const row = state.users.get(asEmail(args[1]))
  if (row) row.last_seen_at = asEmail(args[0])
  return { meta: { changes: row ? 1 : 0 } }
}

function insertGroupGrant(state: AccessState, args: unknown[]) {
  const email = asEmail(args[0])
  const set = state.grants.get(email) ?? new Set<string>()
  set.add(asEmail(args[1]))
  state.grants.set(email, set)
  return { meta: { changes: 1 } }
}

function deleteGroupGrant(state: AccessState, args: unknown[]) {
  const set = state.grants.get(asEmail(args[0]))
  const had = set?.delete(asEmail(args[1])) ?? false
  return { meta: { changes: had ? 1 : 0 } }
}

function deleteAllGroupGrants(state: AccessState, args: unknown[]) {
  state.grants.delete(asEmail(args[0]))
  return { meta: { changes: 1 } }
}

function insertAccessRequest(state: AccessState, args: unknown[]) {
  const id = asEmail(args[0])
  state.requests.set(id, {
    id,
    email: asEmail(args[1]),
    requested_at: NOW,
    status: 'pending',
    token_hash: asEmail(args[2]),
    expires_at: '2027-01-01T00:00:00.000Z',
  })
  return { meta: { changes: 1 } }
}

function setRequestStatus(
  state: AccessState,
  args: unknown[],
  status: 'pending' | 'approved' | 'rejected',
) {
  const row = state.requests.get(asEmail(args[0]))
  if (row) row.status = status
  return { meta: { changes: row ? 1 : 0 } }
}

function purgeTransactions(state: AccessState, args: unknown[]) {
  state.purgedOwners.push(asEmail(args[0]))
  return { meta: { changes: 1 } }
}
