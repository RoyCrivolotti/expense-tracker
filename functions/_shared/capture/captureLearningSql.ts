import type { Candidate, TemplateFacts } from '../../../src/domain/capture'
import type { RecommendationEvent } from '../../../src/domain/ports/captureRepository'

/*
 * What a decision on a recommendation teaches the template of the push behind it. Every statement is scoped by owner
 * and reaches its rows through `idx_capture_events_rec` or the templates' primary key.
 */

/**
 * The push a recommendation came from, with what its template has learned so far. Today a recommendation has one push;
 * when several share one, the first received is read, and its template is the one taught. The template's columns are
 * null when the push has none or it was evicted, which `known` tells apart from a template with nothing learned.
 */
export const EVENT_OF_RECOMMENDATION_SQL = `SELECT e.template_id, e.slots, e.last4, t.template_id AS known,
t.accepts, t.dismissals, t.dismiss_streak, t.amount_slot, t.amount_mark, t.type, t.account_id, t.ignored_at
FROM capture_events e LEFT JOIN capture_templates t ON t.owner = e.owner AND t.template_id = e.template_id
WHERE e.owner = ?1 AND e.rec_id = ?2 ORDER BY e.received_at, e.id LIMIT 1`

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

/** The values of `LEARN_DECISION_SQL`, in order. */
export function learnParams(owner: string, recId: string, templateId: string, f: TemplateFacts): Array<string | number | null> {
  return [owner, templateId, f.accepts, f.dismissals, f.dismissStreak, f.amountSlot, f.amountMark, f.type, f.accountId, f.ignoredAt, recId]
}
