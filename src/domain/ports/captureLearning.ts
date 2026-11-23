import type { TemplateFacts } from '../capture/learn'
import type { MerchantVote } from '../capture/merchants'
import type { MerchantRow } from '../capture/suggestion'

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

/** What a decision teaches, and what has been learned so far. */
export interface CaptureLearningStore {
  /**
   * The push a recommendation came from, with its template's learned columns, in one read. Null when it came from none
   * (one made before pushes were stored).
   */
  eventOfRecommendation(
    owner: string,
    recId: string,
  ): Promise<RecommendationEvent | null>
  /**
   * Writes what a decision taught, in one batch: the template's new facts, when there is a template to teach, the
   * merchant's votes, and the outcome on the recommendation's events. All of it happens only while the outcome is still
   * empty, so a decision learns once however often this runs for it. Merchant rows past `MAX_CAPTURE_MERCHANTS` are
   * evicted in the same batch.
   */
  applyDecisionLearning(
    owner: string,
    recId: string,
    learning: DecisionLearning,
  ): Promise<void>
  /** The owner's rows for one merchant key, at any price and at each one. */
  merchantRows(
    owner: string,
    key: string,
  ): Promise<MerchantRow[]>
}
