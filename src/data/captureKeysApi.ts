import { req } from './apiClient'

/** What the list shows about a key: never the secret, never its hash. */
export interface CaptureKeyInfo {
  keyId: string
  label: string
  createdAt: string
  lastUsedAt: string | null
}

/** The answer to making a key: the only time the whole key is ever sent. */
export interface CreatedCaptureKey extends CaptureKeyInfo {
  key: string
}

export async function fetchCaptureKeys(): Promise<CaptureKeyInfo[]> {
  return (await req<{ keys: CaptureKeyInfo[] }>('/api/capture-keys')).keys
}

export function createCaptureKey(label: string): Promise<CreatedCaptureKey> {
  return req<CreatedCaptureKey>('/api/capture-keys', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label }),
  })
}

export async function revokeCaptureKey(keyId: string): Promise<void> {
  await req<{ ok: true }>(`/api/capture-keys/${encodeURIComponent(keyId)}`, { method: 'DELETE' })
}
