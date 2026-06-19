export type AccessStatus = 'allowed' | 'pending' | 'rejected' | 'none'

export interface AccessStatusResponse {
  status: AccessStatus
  email: string
  isOwner?: boolean
  pendingCount?: number
  requestedAt?: string
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
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { accept: 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export function fetchAccessStatus(): Promise<AccessStatusResponse> {
  return req<AccessStatusResponse>('/api/access/status')
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

export function revokeAccessUser(
  email: string,
): Promise<{ email: string; revoked: true; dataPurged: true }> {
  return req('/api/access/admin/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}
