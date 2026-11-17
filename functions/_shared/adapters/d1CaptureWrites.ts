import { BODY_KEEP_DAYS, MAX_CAPTURE_TEMPLATES } from '../../../src/domain/ports/captureRepository'
import type { CaptureCaps, CaptureEvent, CaptureRepository, NewRecommendation, TemplateDecision } from '../../../src/domain/ports/captureRepository'
import { BLANK_OLD_TEXT_SQL, RECORD_EVENT_SQL, RECORD_RECOMMENDATION_SQL, eventParams } from '../capture/captureEventsSql'
import { BLANK_DECIDED_TEXT_SQL, DECIDE_SQL } from '../capture/captureRecommendationsSql'
import { templateIdOf, templateStatements } from '../capture/captureTemplatesSql'
import { LEARN_DECISION_SQL, RECORD_OUTCOME_SQL, learnParams } from '../capture/captureLearningSql'
import type { TemplateFacts } from '../../../src/domain/capture'

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
): Promise<boolean> {
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
    db.prepare(BLANK_OLD_TEXT_SQL).bind(event.keyId, keepTextSince(event.receivedAt)),
  ])
  return (results[0]?.meta?.changes ?? 0) > 0
}

/** The template's facts first, guarded by the empty outcome the second statement then fills. */
export async function applyDecisionLearning(
  db: D1Database,
  owner: string,
  recId: string,
  template: { templateId: string; facts: TemplateFacts } | null,
  outcome: string,
): Promise<void> {
  const learn = template ? [db.prepare(LEARN_DECISION_SQL).bind(...learnParams(owner, recId, template.templateId, template.facts))] : []
  await db.batch([...learn, db.prepare(RECORD_OUTCOME_SQL).bind(owner, recId, outcome)])
}
