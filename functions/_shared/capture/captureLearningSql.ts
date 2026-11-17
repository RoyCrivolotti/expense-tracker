import type { Candidate, MerchantVote, TemplateFacts } from '../../../src/domain/capture'
import type { RecommendationEvent } from '../../../src/domain/ports/captureRepository'

/*
 * What a decision on a recommendation teaches the template of the push behind it. Every statement is scoped by owner
 * and reaches its rows through `idx_capture_events_rec` or the templates' primary key.
 */

/**
 * The push a recommendation came from, with what its template has learned so far. When several pushes of one movement
 * share it, the one that made it is read (`grouped` is 0 on it alone), and its template is the one taught; the others
 * get the outcome all the same. The template's columns are
 * null when the push has none or it was evicted, which `known` tells apart from a template with nothing learned.
 */
export const EVENT_OF_RECOMMENDATION_SQL = `SELECT e.template_id, e.slots, e.last4, t.template_id AS known,
t.accepts, t.dismissals, t.dismiss_streak, t.amount_slot, t.amount_mark, t.type, t.account_id, t.ignored_at
FROM capture_events e LEFT JOIN capture_templates t ON t.owner = e.owner AND t.template_id = e.template_id
WHERE e.owner = ?1 AND e.rec_id = ?2 ORDER BY e.grouped, e.received_at, e.id LIMIT 1`

/**
 * Writes the facts a decision computed, but only while the recommendation's outcome is still empty: run before
 * `RECORD_OUTCOME_SQL` in one batch, so the decision is counted once however often it is replayed. Two decisions on
 * one template at the same moment can each write facts read before the other, and one of their votes is then lost;
 * the next decision on that template carries on from what was kept.
 */
export const LEARN_DECISION_SQL = `UPDATE capture_templates SET accepts = ?3, dismissals = ?4, dismiss_streak = ?5,
amount_slot = ?6, amount_mark = ?7, type = ?8, account_id = ?9, ignored_at = ?10
WHERE owner = ?1 AND template_id = ?2
AND EXISTS (SELECT 1 FROM capture_events WHERE owner = ?1 AND rec_id = ?11 AND outcome IS NULL)`

/**
 * One vote for what the person called a merchant, at one price or at any (`ANY_AMOUNT`). Guarded by the empty outcome
 * like `LEARN_DECISION_SQL`, so a decision votes once. The vote is an increment, so two decisions at the same moment
 * both count; the category, type and account are the latest saved with that description.
 */
export const VOTE_MERCHANT_SQL = `INSERT INTO capture_merchants
(owner, key, amount_cents, description, category_id, type, account_id, votes, last_seen)
SELECT ?1, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9
WHERE EXISTS (SELECT 1 FROM capture_events WHERE owner = ?1 AND rec_id = ?2 AND outcome IS NULL)
ON CONFLICT (owner, key, amount_cents, description) DO UPDATE SET votes = votes + 1,
category_id = excluded.category_id, type = excluded.type, account_id = excluded.account_id, last_seen = excluded.last_seen`

/**
 * Keeps the owner's newest `?2` merchant rows and deletes the rest, the least recently seen first. Rows written by one
 * decision share a time, and the later row id keeps them ahead of older rows that share it.
 */
export const EVICT_MERCHANTS_SQL = `DELETE FROM capture_merchants WHERE owner = ?1 AND rowid IN
(SELECT rowid FROM capture_merchants WHERE owner = ?1 ORDER BY last_seen DESC, rowid DESC LIMIT -1 OFFSET ?2)`

export const RECORD_OUTCOME_SQL = `UPDATE capture_events SET outcome = ?3 WHERE owner = ?1 AND rec_id = ?2 AND outcome IS NULL`

export interface FactsRow {
  accepts: number
  dismissals: number
  dismiss_streak: number
  amount_slot: number | null
  amount_mark: string | null
  type: string | null
  account_id: number | null
  ignored_at: string | null
}

/** One row of `EVENT_OF_RECOMMENDATION_SQL`. */
export type EventRow = { template_id: string | null; slots: string | null; last4: string | null; known: string | null } & {
  [K in keyof FactsRow]: FactsRow[K] | null
}

export function toEvent(row: EventRow): RecommendationEvent {
  return {
    templateId: row.template_id,
    slots: row.slots,
    last4: row.last4,
    facts: row.known === null ? null : toFacts(row as FactsRow),
  }
}

export function toFacts(row: FactsRow): TemplateFacts {
  return {
    accepts: row.accepts,
    dismissals: row.dismissals,
    dismissStreak: row.dismiss_streak,
    amountSlot: row.amount_slot,
    amountMark: row.amount_mark as Candidate['mark'] | null,
    type: row.type,
    accountId: row.account_id,
    ignoredAt: row.ignored_at,
  }
}

/** The values of `VOTE_MERCHANT_SQL`, in order. */
export function voteParams(owner: string, recId: string, v: MerchantVote, at: string): Array<string | number | null> {
  return [owner, recId, v.key, v.amountCents, v.description, v.categoryId, v.type, v.accountId, at]
}

/** The values of `LEARN_DECISION_SQL`, in order. */
export function learnParams(owner: string, recId: string, templateId: string, f: TemplateFacts): Array<string | number | null> {
  return [owner, templateId, f.accepts, f.dismissals, f.dismissStreak, f.amountSlot, f.amountMark, f.type, f.accountId, f.ignoredAt, recId]
}
