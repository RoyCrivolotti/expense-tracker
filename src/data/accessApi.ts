export type AccessStatus = 'allowed' | 'pending' | 'none'

export interface AccessStatusResponse {
  status: AccessStatus
  email: string
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

export function previewAccessApproval(token: string): Promise<{ email: string; requestId: string }> {
  return req(`/api/access/approve?token=${encodeURIComponent(token)}`)
}

export function confirmAccessApproval(token: string): Promise<{ email: string; approved: true }> {
  return req('/api/access/approve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}
