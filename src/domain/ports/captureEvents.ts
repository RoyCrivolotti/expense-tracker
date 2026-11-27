import type { CaptureSource } from '../capture/types'
import type { NewRecommendation } from './captureRecommendations'
import type { TemplateDecision } from './captureTemplates'

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
  /**
   * Whether the bank wrote a minus on the amount (`amountMinus` in `grouping.ts`): false for a plus or no sign. Null
   * on rows stored before it was kept, and on a row written without the reader.
   */
  amountMinus?: boolean | null
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

/** What was dropped, by day. The only thing kept about a push the app does not recognise. */
export interface CaptureCounter {
  source: CaptureSource
  day: string
  received: number
  unrecognised: number
  /** Requests from a valid key whose body could not be read, counted under `MALFORMED_SOURCE` alone. */
  malformed: number
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

/** The pushes stored, and the limits on storing them. */
export interface CaptureEventLog {
  /**
   * False when nothing was stored: the same push was stored before (replaying changes nothing), or the key is
   * unknown or revoked. A row that breaks a constraint throws instead, so a lost push is never read as a replay.
   */
  recordEvent(
    event: CaptureEvent,
    caps?: CaptureCaps,
  ): Promise<boolean>
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
  /** Whether this push is already stored. Tells a replay from a push refused for a cap, as both store nothing. */
  hasEvent(
    keyId: string,
    source: CaptureSource,
    replayKey: string,
  ): Promise<boolean>
  /**
   * Counts one received push for the key's owner today, unless the owner or everyone has reached the daily cap.
   * The check and the count are one statement, so parallel requests cannot pass the cap together. 'sources' means
   * the person already has the most source words allowed and this one is new: unlike a daily cap, that does not lift
   * with time.
   */
  admit(
    owner: string,
    source: CaptureSource,
    day: string,
    caps: DailyCaps,
  ): Promise<'admitted' | 'limited' | 'sources'>
  eventsSince(
    keyId: string,
    since: string,
  ): Promise<number>
  lastCaptureAt(
    owner: string,
    source: CaptureSource,
  ): Promise<string | null>
}

/** Pushes dropped, counted by day. */
export interface CaptureCounters {
  bumpCounter(
    owner: string,
    source: CaptureSource,
    day: string,
    field: 'received' | 'unrecognised' | 'malformed',
  ): Promise<void>
  readCounters(
    owner: string,
    fromDay: string,
  ): Promise<CaptureCounter[]>
}
