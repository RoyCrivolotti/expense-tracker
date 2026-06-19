import type { AccessRepository } from '../../domain/ports/accessRepository'
import type { Env } from '../env'
import { HttpError } from '../http'
import { isEmailAllowed, isOwnerEmail, requireOwnerEmail } from './accessAuthorizer'

export type AccessStatus = 'allowed' | 'pending' | 'rejected' | 'none'

export interface AccessStatusResult {
  status: AccessStatus
  email: string
  isOwner?: boolean
  pendingCount?: number
  requestedAt?: string
}

export interface AccessServiceDeps {
  repo: AccessRepository
  env: Env
}

export async function getAccessStatus(
  deps: AccessServiceDeps,
  email: string,
): Promise<AccessStatusResult> {
  if (await isEmailAllowed(deps.repo, deps.env, email)) {
    const owner = isOwnerEmail(deps.env, email)
    const pendingCount = owner ? await deps.repo.countPendingRequests() : undefined
    return {
      status: 'allowed',
      email,
      ...(owner ? { isOwner: true, pendingCount: pendingCount ?? 0 } : {}),
    }
  }
  const pending = await deps.repo.findPendingRequest(email)
  if (pending) return { status: 'pending', email, requestedAt: pending.requestedAt }
  const latest = await deps.repo.findLatestRequest(email)
  if (latest?.status === 'rejected') {
    return { status: 'rejected', email, requestedAt: latest.requestedAt }
  }
  return { status: 'none', email }
}

export async function submitAccessRequest(
  deps: AccessServiceDeps,
  email: string,
): Promise<{ status: 'pending' }> {
  if (await isEmailAllowed(deps.repo, deps.env, email)) {
    throw new HttpError(409, 'Already authorised')
  }
  const existing = await deps.repo.findPendingRequest(email)
  if (existing) return { status: 'pending' }

  await deps.repo.createRequest({ id: crypto.randomUUID(), email })
  return { status: 'pending' }
}

export async function listPendingAccessRequests(
  deps: AccessServiceDeps,
  approverEmail: string,
): Promise<Array<{ id: string; email: string; requestedAt: string }>> {
  requireOwnerEmail(deps.env, approverEmail)
  const rows = await deps.repo.listPendingRequests()
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    requestedAt: row.requestedAt,
  }))
}

export async function listActiveAccessUsers(
  deps: AccessServiceDeps,
  approverEmail: string,
): Promise<
  Array<{
    email: string
    grantedAt: string
    grantedBy: string | null
    lastSeenAt: string | null
    isOwner: boolean
  }>
> {
  requireOwnerEmail(deps.env, approverEmail)
  const rows = await deps.repo.listActiveUsers()
  return rows.map((row) => ({
    email: row.email,
    grantedAt: row.grantedAt,
    grantedBy: row.grantedBy,
    lastSeenAt: row.lastSeenAt,
    isOwner: isOwnerEmail(deps.env, row.email),
  }))
}

async function loadPendingRequest(deps: AccessServiceDeps, requestId: string) {
  const request = await deps.repo.findRequestById(requestId)
  if (!request || request.status !== 'pending') {
    throw new HttpError(400, 'Request not found or already handled')
  }
  return request
}

export async function approveAccessRequestById(
  deps: AccessServiceDeps,
  requestId: string,
  approverEmail: string,
): Promise<{ email: string }> {
  requireOwnerEmail(deps.env, approverEmail)
  const request = await loadPendingRequest(deps, requestId)
  await deps.repo.grantAccess(request.email, approverEmail)
  await deps.repo.markRequestApproved(requestId)
  return { email: request.email }
}

export async function rejectAccessRequestById(
  deps: AccessServiceDeps,
  requestId: string,
  approverEmail: string,
): Promise<{ email: string }> {
  requireOwnerEmail(deps.env, approverEmail)
  const request = await loadPendingRequest(deps, requestId)
  await deps.repo.markRequestRejected(requestId)
  return { email: request.email }
}

export async function revokeAccessByEmail(
  deps: AccessServiceDeps,
  targetEmail: string,
  approverEmail: string,
): Promise<{ email: string }> {
  requireOwnerEmail(deps.env, approverEmail)
  const email = targetEmail.trim().toLowerCase()
  if (!email) throw new HttpError(400, 'Missing email')
  if (isOwnerEmail(deps.env, email)) {
    throw new HttpError(400, 'Cannot revoke the owner')
  }
  const revoked = await deps.repo.revokeAccess(email)
  if (!revoked) throw new HttpError(404, 'Active user not found')
  return { email }
}

export async function touchLastSeenIfNeeded(
  deps: AccessServiceDeps,
  email: string,
): Promise<void> {
  if (!(await isEmailAllowed(deps.repo, deps.env, email))) return
  const user = await deps.repo.getAllowedUser(email)
  if (!user) return
  const today = new Date().toISOString().slice(0, 10)
  if (user.lastSeenAt?.startsWith(today)) return
  await deps.repo.touchLastSeen(email, new Date().toISOString())
}
