import { mintCaptureKey } from '../capture/captureKey'
import type { CaptureKeySummary, CaptureRepository } from '../ports/captureRepository'
import { validateLabel } from './labels'

export const MAX_CAPTURE_KEY_LABEL_LENGTH = 40
const DEFAULT_LABEL = 'Shortcut'

/** A name for the key, so the person can tell their keys apart in the list. Blank or missing becomes "Shortcut". */
export function validateCaptureKeyLabel(label: unknown): string {
  return validateLabel(label, DEFAULT_LABEL, MAX_CAPTURE_KEY_LABEL_LENGTH)
}

export interface CreatedCaptureKey extends CaptureKeySummary {
  /** The whole key. This is the only time it exists outside the shortcut that holds it. */
  key: string
}

/** Null when the person already holds the most keys allowed, and nothing was stored. */
export async function createCaptureKey(
  repo: CaptureRepository,
  owner: string,
  label: unknown,
  now: Date,
): Promise<CreatedCaptureKey | null> {
  const name = validateCaptureKeyLabel(label)
  const minted = await mintCaptureKey()
  const createdAt = now.toISOString()
  const stored = await repo.createKey({
    keyId: minted.keyId,
    owner,
    label: name,
    secretHash: minted.secretHash,
    createdAt,
  })
  if (!stored) return null
  return { keyId: minted.keyId, label: name, createdAt, lastUsedAt: null, key: minted.key }
}

export function listCaptureKeys(repo: CaptureRepository, owner: string): Promise<CaptureKeySummary[]> {
  return repo.listKeys(owner)
}

/** False when the key is not this person's or is already revoked. The two are not told apart, so ids cannot be probed. */
export function revokeCaptureKey(repo: CaptureRepository, owner: string, keyId: string, now: Date): Promise<boolean> {
  return repo.revokeKey(owner, keyId, now.toISOString())
}
