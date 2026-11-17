import { BODY_KEEP_DAYS, MAX_CAPTURE_TEMPLATES } from '../../../src/domain/ports/captureRepository'
import type {
  CaptureCaps,
  CaptureEvent,
  CaptureRecorded,
  CaptureRepository,
  DecisionLearning,
  NewRecommendation,
  TemplateDecision,
} from '../../../src/domain/ports/captureRepository'
import {
  BLANK_OLD_TEXT_SQL,
  BUMP_COUNTER_SQL,
  EVENT_GROUPED_SQL,
  JOIN_MERCHANT_SQL,
  RECORD_EVENT_SQL,
  RECORD_RECOMMENDATION_SQL,
  eventParams,
} from '../capture/captureEventsSql'
import { BLANK_DECIDED_TEXT_SQL, DECIDE_SQL } from '../capture/captureRecommendationsSql'
import { SEEN_IGNORED_SQL, templateIdOf, templateStatements } from '../capture/captureTemplatesSql'
import { EVICT_MERCHANTS_SQL, LEARN_DECISION_SQL, RECORD_OUTCOME_SQL, VOTE_MERCHANT_SQL, learnParams, voteParams } from '../capture/captureLearningSql'
import { MAX_CAPTURE_MERCHANTS } from '../../../src/domain/capture'

/*
 * The capture writes that are one D1 batch each, so what they change together commits together or not at all.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Text that arrived before this is blanked. */
function keepTextSince(receivedAt: string): string {
  return new Date(Date.parse(receivedAt) - BODY_KEEP_DAYS * DAY_MS).toISOString()
}

export async function decide(
  db: D1Database,
  owner: string,
  id: string,
  d: Parameters<CaptureRepository['decideRecommendation']>[2],
): Promise<boolean> {
  const [decided] = await db.batch([
    db.prepare(DECIDE_SQL).bind(owner, id, d.state, d.state === 'submitted' ? d.txnId : null, d.at),
    db.prepare(BLANK_DECIDED_TEXT_SQL).bind(owner, id),
  ])
  return (decided?.meta?.changes ?? 0) > 0
}

export async function recordCapture(
  db: D1Database,
  event: CaptureEvent,
  rec: Omit<NewRecommendation, 'owner'>,
  caps: CaptureCaps | undefined,
  template: TemplateDecision,
): Promise<CaptureRecorded> {
  // A merchant the template found can replace the whole body on a recommendation this push joins.
  const span = event.merchantIsSpan && event.merchantRaw !== null ? event.merchantRaw : null
  const results = await db.batch([
    db.prepare(RECORD_EVENT_SQL).bind(...eventParams(event, rec.id, caps, templateIdOf(template))),
    db
      .prepare(RECORD_RECOMMENDATION_SQL)
      .bind(
        event.id,
        rec.id,
        rec.accountId,
        rec.amountCents,
        rec.currency,
        rec.occurredAt,
        rec.localDate,
        rec.merchantRaw,
        rec.descriptionSuggested,
        rec.suggestedType,
        rec.createdAt,
      ),
    ...templateStatements(event.id, template, MAX_CAPTURE_TEMPLATES).map(([sql, params]) => db.prepare(sql).bind(...params)),
    ...(span === null ? [] : [db.prepare(JOIN_MERCHANT_SQL).bind(event.id, span)]),
    db.prepare(BLANK_OLD_TEXT_SQL).bind(event.keyId, keepTextSince(event.receivedAt)),
    db.prepare(EVENT_GROUPED_SQL).bind(event.id),
  ])
  if ((results[0]?.meta?.changes ?? 0) === 0) return false
  const row = results[results.length - 1]?.results?.[0] as { grouped: number } | undefined
  return row?.grouped === 1 ? 'grouped' : 'created'
}

/** The template's facts and the merchant's votes first, each guarded by the empty outcome the last statement then fills. */
export async function applyDecisionLearning(db: D1Database, owner: string, recId: string, learning: DecisionLearning): Promise<void> {
  const { template, merchants, outcome, at } = learning
  const learn = template ? [db.prepare(LEARN_DECISION_SQL).bind(...learnParams(owner, recId, template.templateId, template.facts))] : []
  const votes = merchants.map((v) => db.prepare(VOTE_MERCHANT_SQL).bind(...voteParams(owner, recId, v, at)))
  const evict = votes.length > 0 ? [db.prepare(EVICT_MERCHANTS_SQL).bind(owner, MAX_CAPTURE_MERCHANTS)] : []
  await db.batch([...learn, ...votes, ...evict, db.prepare(RECORD_OUTCOME_SQL).bind(owner, recId, outcome)])
}

export async function countIgnoredPush(db: D1Database, owner: string, source: string, day: string, templateId: string, at: string): Promise<void> {
  await db.batch([
    db.prepare(BUMP_COUNTER_SQL.unrecognised).bind(owner, source, day),
    db.prepare(SEEN_IGNORED_SQL).bind(owner, templateId, at),
  ])
}
