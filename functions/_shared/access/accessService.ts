import type { AccessRepository } from '../../domain/ports/accessRepository'
import type { Env } from '../env'
import { HttpError } from '../http'
import { purgeOwnerExpenseData } from '../ownerDataPurge'
import {
  ACCESS_GROUP_IDS,
  DEFAULT_APPROVE_GROUPS,
  allGroupsGranted,
  emptyGroupGrants,
  isAccessGroupId,
  listAccessGroupMeta,
  type AccessGroupId,
  type GroupGrants,
} from '../../domain/accessGroups'
import { isEmailAllowed, isOwnerEmail, requireOwnerEmail } from './accessAuthorizer'

export type AccessStatus = 'allowed' | 'pending' | 'rejected' | 'none'

export interface AccessStatusResult {
  status: AccessStatus
  email: string
  isOwner?: boolean
  pendingCount?: number
  requestedAt?: string
  groups?: GroupGrants
}

export interface AccessServiceDeps {
  repo: AccessRepository
  env: Env
}

export async function resolveGroupGrants(
  deps: AccessServiceDeps,
  email: string,
): Promise<GroupGrants> {
  if (isOwnerEmail(deps.env, email)) return allGroupsGranted()
  const activeCount = await deps.repo.countActiveUsers()
  if (activeCount === 0 && deps.env.ALLOW_BOOTSTRAP === '1') {
    const fallback = parseEnvAllowlist(deps.env.ALLOWED_EMAILS)
    if (fallback.includes(email)) return allGroupsGranted()
  }
  const granted = await deps.repo.listGroupGrants(email)
  const grants = emptyGroupGrants()
  for (const id of granted) {
    grants[id] = true
  }
  return grants
}

function parseEnvAllowlist(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return [...new Set(raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean))]
}

export async function getAccessStatus(
  deps: AccessServiceDeps,
  email: string,
): Promise<AccessStatusResult> {
  if (await isEmailAllowed(deps.repo, deps.env, email)) {
    const owner = isOwnerEmail(deps.env, email)
    const pendingCount = owner ? await deps.repo.countPendingRequests() : undefined
    const groups = await resolveGroupGrants(deps, email)
    return {
      status: 'allowed',
      email,
      groups,
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

export async function getGroupGrantsForUser(
  deps: AccessServiceDeps,
  email: string,
): Promise<GroupGrants> {
  return resolveGroupGrants(deps, email)
}

export function listAccessGroups(): Array<{ id: AccessGroupId; label: string }> {
  return listAccessGroupMeta()
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
    groups: GroupGrants
  }>
> {
  requireOwnerEmail(deps.env, approverEmail)
  const rows = await deps.repo.listActiveUsers()
  return Promise.all(
    rows.map(async (row) => ({
      email: row.email,
      grantedAt: row.grantedAt,
      grantedBy: row.grantedBy,
      lastSeenAt: row.lastSeenAt,
      isOwner: isOwnerEmail(deps.env, row.email),
      groups: await resolveGroupGrants(deps, row.email),
    })),
  )
}

async function loadPendingRequest(deps: AccessServiceDeps, requestId: string) {
  const request = await deps.repo.findRequestById(requestId)
  if (!request || request.status !== 'pending') {
    throw new HttpError(400, 'Request not found or already handled')
  }
  return request
}

async function grantDefaultGroups(
  deps: AccessServiceDeps,
  email: string,
  grantedBy: string,
): Promise<void> {
  for (const groupId of DEFAULT_APPROVE_GROUPS) {
    await deps.repo.grantGroup(email, groupId, grantedBy)
  }
}

export async function approveAccessRequestById(
  deps: AccessServiceDeps,
  requestId: string,
  approverEmail: string,
): Promise<{ email: string }> {
  requireOwnerEmail(deps.env, approverEmail)
  const request = await loadPendingRequest(deps, requestId)
  await deps.repo.grantAccess(request.email, approverEmail)
  await grantDefaultGroups(deps, request.email, approverEmail)
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
): Promise<{ email: string; dataPurged: true }> {
  requireOwnerEmail(deps.env, approverEmail)
  const email = targetEmail.trim().toLowerCase()
  if (!email) throw new HttpError(400, 'Missing email')
  if (isOwnerEmail(deps.env, email)) {
    throw new HttpError(400, 'Cannot revoke the owner')
  }
  const revoked = await deps.repo.revokeAccess(email)
  if (!revoked) throw new HttpError(404, 'Active user not found')
  await deps.repo.revokeAllGroups(email)
  await purgeOwnerExpenseData(deps.env.DB, email)
  return { email, dataPurged: true }
}

export async function updateUserGroupGrants(
  deps: AccessServiceDeps,
  targetEmail: string,
  approverEmail: string,
  updates: Partial<Record<AccessGroupId, boolean>>,
): Promise<{ email: string; groups: GroupGrants }> {
  requireOwnerEmail(deps.env, approverEmail)
  const email = targetEmail.trim().toLowerCase()
  if (!email) throw new HttpError(400, 'Missing email')
  if (isOwnerEmail(deps.env, email)) {
    throw new HttpError(400, 'Cannot change owner access groups')
  }
  const user = await deps.repo.getAllowedUser(email)
  if (!user || user.status !== 'active') {
    throw new HttpError(404, 'Active user not found')
  }

  for (const [rawId, enabled] of Object.entries(updates)) {
    if (!isAccessGroupId(rawId) || enabled === undefined) continue
    if (enabled) {
      await deps.repo.grantGroup(email, rawId, approverEmail)
      continue
    }
    const hadGrant = await deps.repo.revokeGroup(email, rawId)
    if (rawId === 'expenses' && hadGrant) {
      await purgeOwnerExpenseData(deps.env.DB, email)
    }
  }

  return { email, groups: await resolveGroupGrants(deps, email) }
}

export async function hasExpensesGroupGrant(
  deps: AccessServiceDeps,
  email: string,
): Promise<boolean> {
  const grants = await resolveGroupGrants(deps, email)
  return grants.expenses
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

export { ACCESS_GROUP_IDS }
