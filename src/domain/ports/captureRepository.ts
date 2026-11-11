import type { CaptureSource, PushKind, SuggestedType } from '../capture/types'

/** A person may hold this many keys at once. Regenerating is making a new one, then revoking the old. */
export const MAX_ACTIVE_CAPTURE_KEYS = 3

export type RecommendationState = 'open' | 'submitted' | 'dismissed'

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

/** One recognised push. Fields that would hold another person's name are left null by the caller for those kinds. */
export interface CaptureEvent {
  id: string
  owner: string
  keyId: string
  source: CaptureSource
  replayKey: string
  kind: PushKind
  /** Signed: outflows are negative. Null when the body gave no amount the parser trusts. */
  amountCents: number | null
  currency: string | null
  merchantRaw: string | null
  last4: string | null
  accountDigits: string | null
  occurredAt: string
  localDate: string
  offsetMinutes: number
  receivedAt: string
  recId: string | null
  bodyExcerpt: string | null
}

/** What was dropped, by day. The only thing kept about a push the app does not recognise. */
export interface CaptureCounter {
  source: CaptureSource
  day: string
  received: number
  unrecognised: number
}

export type CardDigitsKind = 'card' | 'account'

export interface CaptureCard {
  source: CaptureSource
  digitsKind: CardDigitsKind
  digits: string
  accountId: number
}

export interface NewRecommendation {
  id: string
  owner: string
  accountId: number | null
  /** Positive cents, or null when the push gave no amount: shown as incomplete. */
  amountCents: number | null
  currency: string | null
  occurredAt: string
  localDate: string
  merchantRaw: string | null
  descriptionSuggested: string | null
  /** Null where the user must pick, as for the two legs of a transfer between their own accounts. */
  suggestedType: SuggestedType | null
  createdAt: string
}

export interface Recommendation extends NewRecommendation {
  state: RecommendationState
  txnId: number | null
  decidedAt: string | null
}

/** Where the next page of the open list starts: after this row, in the list's order. */
export interface RecommendationCursor {
  localDate: string
  id: string
}

/**
 * Persistence for capture. Every method is scoped by owner, except those that start from a key (a request
 * is identified by its key, and the key row names the owner). Times are ISO strings in UTC, passed in so
 * nothing here reads a clock.
 */
export interface CaptureRepository {
  /** False, and nothing written, when the owner already holds the most keys allowed. Decided inside the insert. */
  createKey(key: NewCaptureKey): Promise<boolean>
  findKey(keyId: string): Promise<CaptureKey | null>
  /** The owner's keys that are not revoked, newest first. */
  listKeys(owner: string): Promise<CaptureKeySummary[]>
  /** False when the key is not the owner's or is already revoked. */
  revokeKey(owner: string, keyId: string, at: string): Promise<boolean>
  /** Records a use, at most once a minute per key. */
  touchKey(keyId: string, at: string): Promise<void>

  /** False when the same push was stored before: replaying it changes nothing. */
  recordEvent(event: CaptureEvent): Promise<boolean>
  eventsSince(keyId: string, since: string): Promise<number>
  lastCaptureAt(owner: string, source: CaptureSource): Promise<string | null>
  bumpCounter(owner: string, source: CaptureSource, day: string, field: 'received' | 'unrecognised'): Promise<void>
  readCounters(owner: string, fromDay: string): Promise<CaptureCounter[]>

  saveCard(owner: string, card: CaptureCard): Promise<void>
  listCards(owner: string): Promise<CaptureCard[]>

  createRecommendation(rec: NewRecommendation): Promise<void>
  getRecommendation(owner: string, id: string): Promise<Recommendation | null>
  /** Open ones, newest day first, `limit` of them from after the cursor. */
  listOpenRecommendations(owner: string, limit: number, after?: RecommendationCursor): Promise<Recommendation[]>
  /** Moves an open recommendation to submitted or dismissed. False when it is not open, so a double tap acts once. */
  decideRecommendation(
    owner: string,
    id: string,
    decision: { state: 'submitted'; txnId: number; at: string } | { state: 'dismissed'; at: string },
  ): Promise<boolean>
}
