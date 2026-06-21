import type { AccessState } from './inMemoryAccessDb'
import { activeUsers, asEmail } from './inMemoryAccessDb'

export function queryFirst(sql: string, state: AccessState, args: unknown[]): unknown {
  if (sql.includes('COUNT(*)')) return countQuery(sql, state)
  if (sql.includes('SELECT 1')) return allowedUserExists(state, args)
  if (sql.includes('allowed_users')) return state.users.get(asEmail(args[0])) ?? null
  return accessRequestQuery(sql, state, args)
}

function countQuery(sql: string, state: AccessState): { n: number } {
  if (sql.includes('allowed_users')) return { n: activeUsers(state.users).length }
  const pending = [...state.requests.values()].filter((row) => row.status === 'pending')
  return { n: pending.length }
}

function allowedUserExists(state: AccessState, args: unknown[]): { ok: 1 } | null {
  return state.users.get(asEmail(args[0]))?.status === 'active' ? { ok: 1 } : null
}

function accessRequestQuery(sql: string, state: AccessState, args: unknown[]): unknown {
  if (sql.includes('id = ?')) return state.requests.get(asEmail(args[0])) ?? null
  if (sql.includes("status = 'pending'")) return pendingRequestForEmail(state, args)
  if (sql.includes('ORDER BY requested_at DESC')) return latestRequestForEmail(state, args)
  throw new Error(`inMemoryAccessDb: unsupported query: ${sql}`)
}

function pendingRequestForEmail(state: AccessState, args: unknown[]) {
  return (
    [...state.requests.values()].find(
      (row) => row.email === asEmail(args[0]) && row.status === 'pending',
    ) ?? null
  )
}

function latestRequestForEmail(state: AccessState, args: unknown[]) {
  return (
    [...state.requests.values()]
      .filter((row) => row.email === asEmail(args[0]))
      .sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0] ?? null
  )
}

export function queryAll(sql: string, state: AccessState, args: unknown[]): unknown[] {
  if (sql.includes('allowed_users') && sql.includes("status = 'active'")) {
    return activeUsers(state.users)
  }
  if (sql.includes("status = 'pending'") && sql.includes('ORDER BY requested_at ASC')) {
    return [...state.requests.values()].filter((row) => row.status === 'pending')
  }
  if (sql.includes('SELECT group_id FROM user_group_grants')) {
    return [...(state.grants.get(asEmail(args[0])) ?? [])].map((group_id) => ({ group_id }))
  }
  throw new Error(`inMemoryAccessDb: unsupported query: ${sql}`)
}
