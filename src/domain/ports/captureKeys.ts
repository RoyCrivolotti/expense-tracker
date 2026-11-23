/** A person may hold this many keys at once. Regenerating is making a new one, then revoking the old. */
export const MAX_ACTIVE_CAPTURE_KEYS = 3

/** What the list in Settings shows. The secret's hash is not part of it, so no caller can leak it by accident. */
export interface CaptureKeySummary {
  keyId: string
  label: string
  createdAt: string
  lastUsedAt: string | null
}

/** What a request is checked against: the stored hash of the secret, and who the key belongs to. */
export interface CaptureKey extends CaptureKeySummary {
  owner: string
  secretHash: string
  revokedAt: string | null
}

export interface NewCaptureKey {
  keyId: string
  owner: string
  label: string
  secretHash: string
  createdAt: string
}

/** The keys a person sends pushes with. */
export interface CaptureKeyStore {
  /** False, and nothing written, when the owner already holds the most keys allowed. Decided inside the insert. */
  createKey(key: NewCaptureKey): Promise<boolean>
  findKey(keyId: string): Promise<CaptureKey | null>
  /** The owner's keys that are not revoked, newest first. */
  listKeys(owner: string): Promise<CaptureKeySummary[]>
  /** False when the key is not the owner's or is already revoked. */
  revokeKey(
    owner: string,
    keyId: string,
    at: string,
  ): Promise<boolean>
  /** Records a use, at most once a minute per key. */
  touchKey(
    keyId: string,
    at: string,
  ): Promise<void>
}
