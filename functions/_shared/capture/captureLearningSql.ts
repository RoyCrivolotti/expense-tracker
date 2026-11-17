import type { Candidate, TemplateFacts } from '../../../src/domain/capture'

/*
 * What a decision on a recommendation teaches the template of the push behind it. Every statement is scoped by owner
 * and reaches its rows through `idx_capture_events_rec` or the templates' primary key.
 */

/**
 * The push a recommendation came from. Today a recommendation has one; when several pushes share one, the first
 * received is read, and its template is the one taught.
 */
export const EVENT_OF_RECOMMENDATION_SQL = `SELECT template_id, slots, last4 FROM capture_events
WHERE owner = ?1 AND rec_id = ?2 ORDER BY received_at, id LIMIT 1`

export const TEMPLATE_FACTS_SQL = `SELECT accepts, dismissals, dismiss_streak, amount_slot, amount_mark, type, account_id, ignored_at
FROM capture_templates WHERE owner = ?1 AND template_id = ?2`

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

/** The values of `LEARN_DECISION_SQL`, in order. */
export function learnParams(owner: string, recId: string, templateId: string, f: TemplateFacts): Array<string | number | null> {
  return [owner, templateId, f.accepts, f.dismissals, f.dismissStreak, f.amountSlot, f.amountMark, f.type, f.accountId, f.ignoredAt, recId]
}
