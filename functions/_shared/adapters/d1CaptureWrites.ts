import { MAX_CAPTURE_TEMPLATES } from '../../../src/domain/ports/captureRepository'
import type { CaptureCaps, CaptureEvent, NewRecommendation, TemplateDecision } from '../../../src/domain/ports/captureRepository'
import { RECORD_EVENT_SQL, RECORD_RECOMMENDATION_SQL, eventParams } from '../capture/captureEventsSql'
import { templateIdOf, templateStatements } from '../capture/captureTemplatesSql'

/*
 * The capture writes that are one D1 batch each, so what they change together commits together or not at all.
 */

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
  ])
  return (results[0]?.meta?.changes ?? 0) > 0
}
