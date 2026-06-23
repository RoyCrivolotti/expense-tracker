import type { AccessGroupId, GroupGrants } from '../domain/accessGroups'
import { req } from './apiClient'

export type { AccessGroupId, GroupGrants }

export type AccessStatus = 'allowed' | 'pending' | 'rejected' | 'none'

export interface AccessStatusResponse {
  status: AccessStatus
  email: string
  isOwner?: boolean
  pendingCount?: number
  requestedAt?: string
  groups?: GroupGrants
}

export interface AccessGroupMeta {
  id: AccessGroupId
  label: string
}

export interface PendingAccessRequest {
  id: string
  email: string
  requestedAt: string
}

export interface ActiveAccessUser {
  email: string
  grantedAt: string
  grantedBy: string | null
  lastSeenAt: string | null
  isOwner: boolean
  groups: GroupGrants
}

export function fetchAccessStatus(): Promise<AccessStatusResponse> {
  return req<AccessStatusResponse>('/api/access/status')
}

export function fetchAccessGroups(): Promise<{ groups: AccessGroupMeta[] }> {
  return req<{ groups: AccessGroupMeta[] }>('/api/access/groups')
}

export function requestAccess(): Promise<{ status: 'pending' }> {
  return req('/api/access/request', { method: 'POST' })
}

export function fetchPendingAccessRequests(): Promise<{ requests: PendingAccessRequest[] }> {
  return req('/api/access/admin/pending')
}

export function fetchActiveAccessUsers(): Promise<{ users: ActiveAccessUser[] }> {
  return req('/api/access/admin/users')
}

export function approveAccessRequest(requestId: string): Promise<{ email: string; approved: true }> {
  return req('/api/access/admin/approve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId }),
  })
}

export function rejectAccessRequest(requestId: string): Promise<{ email: string; rejected: true }> {
  return req('/api/access/admin/reject', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId }),
  })
}

export function updateUserGroupGrants(
  email: string,
  groups: Partial<Record<AccessGroupId, boolean>>,
): Promise<{ email: string; groups: GroupGrants }> {
  return req(`/api/access/admin/users/${encodeURIComponent(email)}/grants`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ groups }),
  })
}

export function revokeAccessUser(
  email: string,
): Promise<{ email: string; revoked: true; dataPurged: true }> {
  return req('/api/access/admin/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}
