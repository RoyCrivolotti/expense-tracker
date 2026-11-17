import type { IgnoredTemplate, TemplateDecision } from '../../../src/domain/ports/captureRepository'

export const FIND_TEMPLATES_SQL = `SELECT template_id, skeleton, merchant_start, merchant_end, ignored_at FROM capture_templates
WHERE owner = ?1 AND source = ?2 AND title = ?3 ORDER BY last_seen DESC LIMIT ?4`

export interface TemplateRow {
  template_id: string
  skeleton: string
  merchant_start: number | null
  merchant_end: number | null
  ignored_at: string | null
}

/** The person's ignored templates, newest ignore first. A person holds at most 500 templates, so the sort is small. */
export const LIST_IGNORED_SQL = `SELECT template_id, source, skeleton, seen, dismissals, ignored_at FROM capture_templates
WHERE owner = ?1 AND ignored_at IS NOT NULL ORDER BY ignored_at DESC, template_id LIMIT ?2`

export interface IgnoredRow {
  template_id: string
  source: string
  skeleton: string
  seen: number
  dismissals: number
  ignored_at: string
}

export function toIgnored(r: IgnoredRow): IgnoredTemplate {
  return { templateId: r.template_id, source: r.source, skeleton: r.skeleton, seen: r.seen, dismissals: r.dismissals, ignoredAt: r.ignored_at }
}

/** Changes a row whether or not it was ignored, so a template the person holds always answers true. */
export const UNIGNORE_SQL = `UPDATE capture_templates SET ignored_at = NULL, dismiss_streak = 0 WHERE owner = ?1 AND template_id = ?2`

/** A push of an ignored template is seen, and nothing else. Only while it is still ignored. */
export const SEEN_IGNORED_SQL = `UPDATE capture_templates SET seen = seen + 1, last_seen = ?3
WHERE owner = ?1 AND template_id = ?2 AND ignored_at IS NOT NULL`

/*
 * The statements below run in the batch that stores a push, after its event. Each takes the owner, and the source and
 * time where it needs them, from the event row (`?1` is its id), so when the event was not stored (a replay, a cap, a
 * revoked key) they find no owner and change nothing.
 */
const OWNER_OF_EVENT = '(SELECT owner FROM capture_events WHERE id = ?1)'

/**
 * Makes room at the cap: deletes the least recently seen template nobody has accepted and nobody has ignored, but only
 * when the owner holds `?2` already. With none to evict the insert after it stores nothing.
 */
export const EVICT_TEMPLATE_SQL = `DELETE FROM capture_templates
WHERE owner = ${OWNER_OF_EVENT}
AND template_id = (SELECT template_id FROM capture_templates WHERE owner = ${OWNER_OF_EVENT}
  AND accepts = 0 AND ignored_at IS NULL ORDER BY last_seen, template_id LIMIT 1)
AND (SELECT COUNT(*) FROM capture_templates WHERE owner = ${OWNER_OF_EVENT}) >= ?2`

/** A new template, unless the owner is still at the cap. Seen once by `SEEN_TEMPLATE_SQL` just after. */
export const INSERT_TEMPLATE_SQL = `INSERT INTO capture_templates (owner, template_id, source, title, skeleton, first_seen, last_seen)
SELECT e.owner, ?2, e.source, ?3, ?4, e.received_at, e.received_at FROM capture_events e
WHERE e.id = ?1 AND (SELECT COUNT(*) FROM capture_templates t WHERE t.owner = e.owner) < ?5`

/** The run a sibling push revealed. Only the first to learn it writes, so two pushes at once cannot disagree. */
export const LEARN_RUN_SQL = `UPDATE capture_templates SET skeleton = ?3, merchant_start = ?4, merchant_end = ?5
WHERE owner = ${OWNER_OF_EVENT} AND template_id = ?2 AND merchant_start IS NULL`

export const SEEN_TEMPLATE_SQL = `UPDATE capture_templates
SET seen = seen + 1, last_seen = (SELECT received_at FROM capture_events WHERE id = ?1)
WHERE owner = ${OWNER_OF_EVENT} AND template_id = ?2`

/**
 * Clears the event's template when it names none the owner holds: the insert stopped at the cap with nothing to
 * evict, or another push evicted the template between reading it and this write.
 */
export const DROP_MISSING_TEMPLATE_SQL = `UPDATE capture_events SET template_id = NULL
WHERE id = ?1 AND template_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM capture_templates t
  WHERE t.owner = capture_events.owner AND t.template_id = capture_events.template_id)`

/** The template id an event is written with: the one it joins or makes. */
export function templateIdOf(decision: TemplateDecision): string | null {
  if (decision.kind === 'existing') return decision.templateId
  return decision.kind === 'new' ? decision.template.templateId : null
}

/** The statements, with their values, that apply a template decision for the event `eventId`. */
export function templateStatements(
  eventId: string,
  decision: TemplateDecision,
  cap: number,
): Array<[string, Array<string | number | null>]> {
  const templateId = templateIdOf(decision)
  if (templateId === null) return []
  const change: Array<[string, Array<string | number | null>]> = []
  if (decision.kind === 'new') {
    const { title, skeleton } = decision.template
    change.push([EVICT_TEMPLATE_SQL, [eventId, cap]], [INSERT_TEMPLATE_SQL, [eventId, templateId, title, skeleton, cap]])
  } else if (decision.kind === 'existing' && decision.learnedRun) {
    const { skeleton, start, end } = decision.learnedRun
    change.push([LEARN_RUN_SQL, [eventId, templateId, skeleton, start, end]])
  }
  change.push([SEEN_TEMPLATE_SQL, [eventId, templateId]], [DROP_MISSING_TEMPLATE_SQL, [eventId]])
  return change
}
