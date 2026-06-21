import type { AccessRepository } from '../../domain/ports/accessRepository'
import type { Env } from '../env'
import { HttpError } from '../http'

function parseEnvAllowlist(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return [...new Set(raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean))]
}

/** D1 allowlist; ALLOWED_EMAILS env fallback only when table is empty and ALLOW_BOOTSTRAP=1. */
export async function isEmailAllowed(
  repo: AccessRepository,
  env: Env,
  email: string,
): Promise<boolean> {
  const activeCount = await repo.countActiveUsers()
  if (activeCount === 0) {
    if (env.ALLOW_BOOTSTRAP !== '1') return false
    const fallback = parseEnvAllowlist(env.ALLOWED_EMAILS)
    if (fallback.length === 0) return false
    return fallback.includes(email)
  }
  return repo.isAllowed(email)
}

export async function requireAllowedEmail(
  repo: AccessRepository,
  env: Env,
  email: string,
): Promise<void> {
  if (!(await isEmailAllowed(repo, env, email))) {
    throw new HttpError(403, 'Not authorised')
  }
}

export function requireOwnerEmail(env: Env, email: string): void {
  const owner = env.OWNER_EMAIL?.trim().toLowerCase()
  if (!owner) throw new HttpError(503, 'Owner not configured')
  if (email !== owner) throw new HttpError(403, 'Owner only')
}

export function isOwnerEmail(env: Env, email: string): boolean {
  const owner = env.OWNER_EMAIL?.trim().toLowerCase()
  return Boolean(owner && email === owner)
}

export function ownerEmail(env: Env): string {
  const owner = env.OWNER_EMAIL?.trim().toLowerCase()
  if (!owner) throw new HttpError(503, 'Owner not configured')
  return owner
}

export async function requireExpensesGroupGrant(
  repo: AccessRepository,
  env: Env,
  email: string,
): Promise<void> {
  if (isOwnerEmail(env, email)) return
  const activeCount = await repo.countActiveUsers()
  if (activeCount === 0 && env.ALLOW_BOOTSTRAP === '1') {
    const fallback = parseEnvAllowlist(env.ALLOWED_EMAILS)
    if (fallback.includes(email)) return
  }
  const granted = await repo.listGroupGrants(email)
  if (!granted.includes('expenses')) {
    throw new HttpError(403, 'Expense tracker access not granted')
  }
}
