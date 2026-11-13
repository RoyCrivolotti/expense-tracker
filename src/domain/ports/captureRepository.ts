import type { PaymentToMatch, PossibleMatch } from '../capture/duplicate'
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

/**
 * One recognised push. Fields that would hold another person's name are left null by the caller for those kinds.
 * There is no owner: the owner is the key's, read inside the insert, so an event cannot be filed under a person
 * the key does not belong to, nor under a key revoked a moment ago.
 */
export interface CaptureEvent {
  id: string
  keyId: string
  source: CaptureSource
  /**
   * Identifies the push so that sending it twice stores it once. The column holds whatever is passed. The pure
   * `replayKey` is an unsalted SHA-256, which a guessable body (a one-time code) could be matched against, so the
   * capture Worker must store an HMAC of it under a secret and pass that.
   */
  replayKey: string
  kind: PushKind
  /** Signed: outflows are negative. Null when the body gave no amount the parser trusts. */
  amountCents: number | null
  currency: string | null
  /** At most 200 characters. */
  merchantRaw: string | null
  last4: string | null
  accountDigits: string | null
  /** The moment as a UTC instant (`...Z`). */
  occurredAt: string
  localDate: string
  offsetMinutes: number
  receivedAt: string
  /** Set by `recordCapture` from the recommendation it writes; ignored on input. */
  recId?: string | null
  /** Only for a recognised push that came out incomplete, never for a kind that names a person. Blank it once the user decides. At most 500 characters. */
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

export type LinkCardResult = 'linked' | 'no-account' | 'limit'

/** Digits with open payments and no account to put them in. */
export interface WaitingCard {
  source: CaptureSource
  digits: string
  /** How many open payments wait on it. */
  count: number
}

/** The most links one person may hold. Each card has one, and a reissued card is another. */
export const MAX_CAPTURE_CARDS = 50

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
  /**
   * The moment on the phone's own clock, with the phone's offset (`2026-11-03T09:41:07+01:00`). A row written before
   * this was kept in UTC (`...Z`), which carries no offset, so the phone's time of day cannot be read from it.
   */
  occurredAt: string
  localDate: string
  merchantRaw: string | null
  descriptionSuggested: string | null
  /** Null where the user must pick, as for the two legs of a transfer between their own accounts. */
  suggestedType: SuggestedType | null
  createdAt: string
}

/** The card a payment came from, as the push showed it: the bank app and the last four digits. */
export interface RecommendationCard {
  source: CaptureSource
  digits: string
}

export interface Recommendation extends NewRecommendation {
  /** A row the person already typed that looks like this payment, or null. Filled in on a list read, not on a single read. */
  possibleMatch?: PossibleMatch | null
  /** Null when the push showed no digits. Filled in on a list read, not on a single read. */
  card?: RecommendationCard | null
  state: RecommendationState
  txnId: number | null
  decidedAt: string | null
}

/** What one accepted push is counted against. Times are ISO strings, so the caller passes the clock in. */
export interface CaptureCaps {
  /** Pushes this key may store since `hourSince`, and since `daySince`. */
  keyPerHour: number
  keyPerDay: number
  hourSince: string
  daySince: string
  /** Open recommendations the person may hold, so a flood cannot grow their list without bound. */
  openPerOwner: number
}

/** The daily limits on pushes received, whether or not they are recognised. */
export interface DailyCaps {
  perOwner: number
  global: number
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

  /**
   * False when nothing was stored: the same push was stored before (replaying changes nothing), or the key is
   * unknown or revoked. A row that breaks a constraint throws instead, so a lost push is never read as a replay.
   */
  recordEvent(event: CaptureEvent, caps?: CaptureCaps): Promise<boolean>
  /**
   * Stores the event and its recommendation in one D1 batch, which commits both or neither, so a failure between
   * them cannot leave a push stored with no recommendation (a retry would then be read as a replay). The
   * recommendation takes its owner from the event. Returns false, writing neither, as `recordEvent` does.
   */
  recordCapture(
    event: CaptureEvent,
    recommendation: Omit<NewRecommendation, 'owner'>,
    caps?: CaptureCaps,
  ): Promise<boolean>
  /** Whether this push is already stored. Tells a replay from a push refused for a cap, as both store nothing. */
  hasEvent(keyId: string, source: CaptureSource, replayKey: string): Promise<boolean>
  /**
   * Counts one received push for the key's owner today, unless the owner or everyone has reached the daily cap.
   * The check and the count are one statement, so parallel requests cannot pass the cap together.
   */
  admit(owner: string, source: CaptureSource, day: string, caps: DailyCaps): Promise<boolean>
  eventsSince(keyId: string, since: string): Promise<number>
  lastCaptureAt(owner: string, source: CaptureSource): Promise<string | null>
  bumpCounter(owner: string, source: CaptureSource, day: string, field: 'received' | 'unrecognised'): Promise<void>
  readCounters(owner: string, fromDay: string): Promise<CaptureCounter[]>

  saveCard(owner: string, card: CaptureCard): Promise<void>
  /**
   * Links digits to one of the owner's accounts, or changes the account they point at, and points the open
   * recommendations those digits made at it. `no-account` when the account is not the owner's, `limit` at the cap.
   */
  linkCard(owner: string, card: CaptureCard): Promise<LinkCardResult>
  /** Removes the link, and unmaps the open recommendations those digits made. False when there was none. */
  unlinkCard(owner: string, source: CaptureSource, digitsKind: CardDigitsKind, digits: string): Promise<boolean>
  /** The cards open payments wait on for want of an account. */
  listWaitingCards(owner: string): Promise<WaitingCard[]>
  listCards(owner: string): Promise<CaptureCard[]>

  createRecommendation(rec: NewRecommendation): Promise<void>
  getRecommendation(owner: string, id: string): Promise<Recommendation | null>
  /** Open ones, newest day first, `limit` of them from after the cursor. */
  listOpenRecommendations(owner: string, limit: number, after?: RecommendationCursor): Promise<Recommendation[]>
  /** How many are open, for the badge. */
  /** The typed row of the owner that looks like this payment, by the rule the list uses, or null. One read. */
  findPossibleMatch(owner: string, payment: PaymentToMatch): Promise<PossibleMatch | null>
  countOpenRecommendations(owner: string): Promise<number>
  /** Moves an open recommendation to submitted or dismissed. False when it is not open, so a double tap acts once. */
  decideRecommendation(
    owner: string,
    id: string,
    decision: { state: 'submitted'; txnId: number; at: string } | { state: 'dismissed'; at: string },
  ): Promise<boolean>
}
