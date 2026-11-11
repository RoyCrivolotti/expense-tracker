import { mintCaptureKey } from '../capture/captureKey'
import type { CaptureKeySummary, CaptureRepository } from '../ports/captureRepository'
import { ValidationError } from './validationError'

export const MAX_CAPTURE_KEY_LABEL_LENGTH = 40
const DEFAULT_LABEL = 'Shortcut'
// Control characters and the bidirectional overrides: the label is shown back in a list, and a hostile one could
// reorder what is around it. Written as escapes so the source holds no invisible character.
// eslint-disable-next-line no-control-regex
const UNSAFE_LABEL_CHARS = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/

/** A name for the key, so the person can tell their keys apart in the list. Blank or missing becomes "Shortcut". */
export function validateCaptureKeyLabel(label: unknown): string {
  if (label === undefined || label === null) return DEFAULT_LABEL
  if (typeof label !== 'string') throw new ValidationError('Label must be text')
  const trimmed = label.trim()
  if (UNSAFE_LABEL_CHARS.test(trimmed)) throw new ValidationError('Label cannot contain control characters')
  if (trimmed.length > MAX_CAPTURE_KEY_LABEL_LENGTH) {
    throw new ValidationError(`Label must be at most ${MAX_CAPTURE_KEY_LABEL_LENGTH} characters`)
  }
  return trimmed || DEFAULT_LABEL
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
