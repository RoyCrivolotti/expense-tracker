import type { PaymentToMatch, PossibleMatch } from '../capture/duplicate'
import type { Suggestion } from '../capture/suggestion'
import type { CaptureSource, SuggestedType } from '../capture/types'

export type RecommendationState = 'open' | 'submitted' | 'dismissed'

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

/** Where the next page of the open list starts: after this row, in the list's order. */
export interface RecommendationCursor {
  localDate: string
  id: string
}

/** The payments waiting for the person to decide. */
export interface CaptureRecommendationStore {
  createRecommendation(rec: NewRecommendation): Promise<void>
  getRecommendation(
    owner: string,
    id: string,
  ): Promise<Recommendation | null>
  /** The one that answers for this transaction of the owner, linked or made by submitting it, or null. */
  recommendationAnswering(
    owner: string,
    txnId: number,
  ): Promise<Recommendation | null>
  /** Open ones, newest day first, `limit` of them from after the cursor. */
  listOpenRecommendations(
    owner: string,
    limit: number,
    after?: RecommendationCursor,
  ): Promise<Recommendation[]>
  /** The typed row of the owner that looks like this payment, by the rule the list uses, or null. One read. */
  findPossibleMatch(
    owner: string,
    payment: PaymentToMatch,
  ): Promise<PossibleMatch | null>
  /** How many are open, for the badge. */
  countOpenRecommendations(owner: string): Promise<number>
  /** What a summary notification says about the open ones, from one read. */
  summarizeOpen(owner: string): Promise<OpenSummary>
  /**
   * Moves an open recommendation to submitted or dismissed, and blanks the text of the push it came from in the same
   * batch. False when it is not open, so a double tap acts once. `takeFrom` names the recommendation that answers for
   * the transaction now: it stays submitted but stops answering for it, in the same batch and only if this one moves.
   */
  decideRecommendation(
    owner: string,
    id: string,
    decision: { state: 'submitted'; txnId: number; at: string; takeFrom?: string } | { state: 'dismissed'; at: string },
  ): Promise<boolean>
}
