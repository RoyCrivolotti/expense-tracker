import { HttpError } from '../http'
import { purgeOwnerData } from '../ownerDataPurge'
import {
  allGroupsGranted,
  emptyGroupGrants,
  isAccessGroupId,
  listAccessGroupMeta,
  type AccessGroupId,
  type GroupGrants,
} from '../../domain/accessGroups'
import { isOwnerEmail, requireOwnerEmail } from './accessAuthorizer'
import type { AccessServiceDeps } from './accessService'

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
  return [
    ...new Set(
      raw
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
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
    await deps.repo.revokeGroup(email, rawId)
    // Not only when a grant was removed: a purge that failed leaves no grant to remove on the repeat, and nothing
    // else would ever purge the data. The purge is safe to repeat.
    if (rawId === 'expenses') await purgeOwnerData(deps.env, email)
  }

  return { email, groups: await resolveGroupGrants(deps, email) }
}
