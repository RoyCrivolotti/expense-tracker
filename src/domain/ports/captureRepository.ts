import type { PaymentToMatch, PossibleMatch } from '../capture/duplicate'
import type { TemplateFacts } from '../capture/learn'
import type { MerchantVote } from '../capture/merchants'
import type { MerchantRow, Suggestion } from '../capture/suggestion'
import type { CaptureSource, SuggestedType } from '../capture/types'
import type { CaptureStatusReads } from './captureStatusReads'

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
 * One stored push: one that shows an amount with a currency marker. There is no owner: the owner is the key's, read inside the insert, so an event cannot be filed under a person
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
  /**
   * Always `push`: the reader names no kind, and what a push is comes from the person's decisions. Rows stored before
   * that hold the name of the rule that matched them.
   */
  kind: 'push'
  /** Positive: the push says nothing the server trusts about direction. Null only on rows stored before that rule. */
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
  /** `shapeId` of the push's source and skeleton. Null for a row written without the reader. */
  shapeId?: string | null
  /** The person's template the push belongs to. `recordCapture` sets it from the template decision; ignored on input. */
  templateId?: string | null
  /** The slots the reader found, as JSON, at most 2,000 characters. */
  slots?: string | null
  /**
   * True when `merchantRaw` is the merchant the push's template found, not its whole body. Not stored: it lets a push
   * that joins a recommendation give it the merchant when the push that made it could only give its whole body.
   */
  merchantIsSpan?: boolean
  /**
   * The cleaned body, only for a push that shows an amount with a currency marker, and blanked when the recommendation
   * is decided or `BODY_KEEP_DAYS` after it arrived. At most 500 characters.
   */
  body: string | null
}

/**
 * What `recordCapture` did: stored the push with a recommendation of its own (`created`), stored it as another push of
 * an open recommendation of the same movement (`grouped`), or stored nothing (false).
 */
export type CaptureRecorded = 'created' | 'grouped' | false

/** Days a push's text is kept when nobody decides its recommendation first. */
export const BODY_KEEP_DAYS = 30

/** Templates one person may hold. At the cap, the least recently seen one nobody has accepted makes room. */
export const MAX_CAPTURE_TEMPLATES = 500

/** Templates of one title a new push is compared with, the most recently seen first. */
export const TEMPLATE_LOOKUP_LIMIT = 50

/** A template as a new push is matched against it. */
export interface CaptureTemplate {
  templateId: string
  /** The masked words, with `<M>` where the merchant goes once a sibling push has shown it. */
  skeleton: string
  /** The `<M>` token's run in `skeleton`, end exclusive. Null until known. */
  merchantStart: number | null
  merchantEnd: number | null
  /** When the person's dismissals muted it. Its pushes are then counted and never stored. */
  ignoredAt: string | null
}

/** The most ignored templates one list returns. A person holds at most `MAX_CAPTURE_TEMPLATES` in all. */
export const MAX_IGNORED_LISTED = 100

/** A template the person's dismissals muted, as the list of them shows it: its masked words, never a push's body. */
export interface IgnoredTemplate {
  templateId: string
  source: CaptureSource
  skeleton: string
  seen: number
  dismissals: number
  ignoredAt: string
}

/** The run a template has just learned from a sibling push, and its skeleton rewritten with the wildcard there. */
export interface LearnedRun {
  start: number
  end: number
  skeleton: string
}

/**
 * Which template a push joins, decided before the write so the batch that stores the push stores the template
 * change with it. A new template takes its owner, source and dates from the event. `none` is for a push whose
 * template would be too large to keep.
 */
export type TemplateDecision =
  | { kind: 'existing'; templateId: string; learnedRun?: LearnedRun }
  | { kind: 'new'; template: { templateId: string; title: string; skeleton: string } }
  | { kind: 'none' }

/** What a decision on a recommendation learns from the push that made it. Its text is blanked by then, so none is here. */
export interface RecommendationEvent {
  /** Null when the push got no template, or its template was evicted before it was stored. */
  templateId: string | null
  /** The slots as stored, JSON. */
  slots: string | null
  /** The card digits the push showed, or null. */
  last4: string | null
  /** What the template has learned so far. Null when the push has no template or it no longer exists. */
  facts: TemplateFacts | null
}

/** What one decision teaches, written in one batch by `applyDecisionLearning`. */
export interface DecisionLearning {
  /** The template's facts after the decision, or null when the push has no template to teach. */
  template: { templateId: string; facts: TemplateFacts } | null
  /** Votes for what the person called the merchant. Empty for a dismissal and for text that is not a merchant. */
  merchants: readonly MerchantVote[]
  outcome: string
  /** When the decision was made, the merchant rows' `last_seen`. */
  at: string
}

/** What was dropped, by day. The only thing kept about a push the app does not recognise. */
export interface CaptureCounter {
  source: CaptureSource
  day: string
  received: number
  unrecognised: number
  /** Requests from a valid key whose body could not be read, counted under `MALFORMED_SOURCE` alone. */
  malformed: number
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

/**
 * The open recommendations in one line: how many, and their total when it means something. The total is present only
 * when every open one has an amount and they all share one currency; `onlyId` only when exactly one is open.
 */
export interface OpenSummary {
  count: number
  totalCents: number | null
  currency: string | null
  onlyId: string | null
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
  /**
   * What the person's own history says the payment should become (`suggestFor`), or null for one no push made. Filled
   * in on a list read, not on a single read.
   */
  suggestion?: Suggestion | null
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
  /** Different source words one person may have counted, ever. A word already counted is always admitted. */
  sourcesPerOwner: number
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
export interface CaptureRepository extends CaptureStatusReads {
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
   * recommendation takes its owner from the event. When an open recommendation of the owner is the same movement
   * (`sameMovement`), the event joins it instead and no recommendation is made; the batch decides that, so pushes that
   * arrive at once cannot both make one. The same batch applies the template decision (a new template, evicting one at
   * the cap, or a learned run, and the count of pushes seen) and blanks the owner's push text older than
   * `BODY_KEEP_DAYS`. Returns false, writing nothing but that blanking, as `recordEvent` does: a replay changes no
   * template.
   */
  recordCapture(
    event: CaptureEvent,
    recommendation: Omit<NewRecommendation, 'owner'>,
    caps?: CaptureCaps,
    template?: TemplateDecision,
  ): Promise<CaptureRecorded>
  /**
   * The owner's templates for this source and masked title, at most `TEMPLATE_LOOKUP_LIMIT`, the most recently seen
   * first.
   */
  findTemplates(owner: string, source: CaptureSource, title: string): Promise<CaptureTemplate[]>
  /**
   * Counts a push of an ignored template, in one batch: as unrecognised on the owner's counter for `day`, and as seen
   * on the template, which stays ignored. Nothing of the push is stored.
   */
  countIgnoredPush(owner: string, source: CaptureSource, day: string, templateId: string, at: string): Promise<void>
  /** The owner's ignored templates, the most recently ignored first, at most `MAX_IGNORED_LISTED`. */
  listIgnoredTemplates(owner: string): Promise<IgnoredTemplate[]>
  /**
   * Makes the template suggest again: clears its ignore and its dismissal streak, so three more dismissals in a row are
   * needed to mute it again. False when the owner holds no such template.
   */
  unignoreTemplate(owner: string, templateId: string): Promise<boolean>
  /** Whether this push is already stored. Tells a replay from a push refused for a cap, as both store nothing. */
  hasEvent(keyId: string, source: CaptureSource, replayKey: string): Promise<boolean>
  /**
   * Counts one received push for the key's owner today, unless the owner or everyone has reached the daily cap.
   * The check and the count are one statement, so parallel requests cannot pass the cap together. 'sources' means
   * the person already has the most source words allowed and this one is new: unlike a daily cap, that does not lift
   * with time.
   */
  admit(owner: string, source: CaptureSource, day: string, caps: DailyCaps): Promise<'admitted' | 'limited' | 'sources'>
  eventsSince(keyId: string, since: string): Promise<number>
  lastCaptureAt(owner: string, source: CaptureSource): Promise<string | null>
  bumpCounter(owner: string, source: CaptureSource, day: string, field: 'received' | 'unrecognised' | 'malformed'): Promise<void>
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
  /** The typed row of the owner that looks like this payment, by the rule the list uses, or null. One read. */
  findPossibleMatch(owner: string, payment: PaymentToMatch): Promise<PossibleMatch | null>
  /** How many are open, for the badge. */
  countOpenRecommendations(owner: string): Promise<number>
  /** What a summary notification says about the open ones, from one read. */
  summarizeOpen(owner: string): Promise<OpenSummary>
  /**
   * Moves an open recommendation to submitted or dismissed, and blanks the text of the push it came from in the same
   * batch. False when it is not open, so a double tap acts once.
   */
  decideRecommendation(
    owner: string,
    id: string,
    decision: { state: 'submitted'; txnId: number; at: string } | { state: 'dismissed'; at: string },
  ): Promise<boolean>

  /**
   * The push a recommendation came from, with its template's learned columns, in one read. Null when it came from none
   * (one made before pushes were stored).
   */
  eventOfRecommendation(owner: string, recId: string): Promise<RecommendationEvent | null>
  /**
   * Writes what a decision taught, in one batch: the template's new facts, when there is a template to teach, the
   * merchant's votes, and the outcome on the recommendation's events. All of it happens only while the outcome is still
   * empty, so a decision learns once however often this runs for it. Merchant rows past `MAX_CAPTURE_MERCHANTS` are
   * evicted in the same batch.
   */
  applyDecisionLearning(owner: string, recId: string, learning: DecisionLearning): Promise<void>
  /** The owner's rows for one merchant key, at any price and at each one. */
  merchantRows(owner: string, key: string): Promise<MerchantRow[]>
}
