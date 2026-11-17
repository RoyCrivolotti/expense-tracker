import { WILDCARD, siblingSlot, withWildcard } from '../../../src/domain/capture'
import type { PushReading, TokenRun } from '../../../src/domain/capture'
import type { CaptureTemplate, TemplateDecision } from '../../../src/domain/ports/captureRepository'

/** What the `capture_templates` columns hold at most. A push whose template would not fit gets none. */
export const MAX_TEMPLATE_TEXT = 1000

/** The template a push joins, and where its merchant is in the push's skeleton when the template knows. */
export interface TemplateMatch {
  decision: TemplateDecision
  merchant: TokenRun | null
}

/**
 * Which of the person's templates a push belongs to. A template with the same skeleton is it. Otherwise the first,
 * most recently seen, that is a sibling (`siblingSlot`): one whose merchant is already known must differ from the push
 * exactly at its `<M>`, and one whose merchant is not yet known learns it from the push. The push's own run of that
 * pair is its merchant. Null when none is.
 */
export function matchTemplate(rows: readonly CaptureTemplate[], skeleton: readonly string[]): TemplateMatch | null {
  const joined = skeleton.join(' ')
  const same = rows.find((row) => row.skeleton === joined)
  if (same) return { decision: { kind: 'existing', templateId: same.templateId }, merchant: null }
  for (const row of rows) {
    const tokens = row.skeleton.split(' ')
    const runs = siblingSlot(tokens, skeleton)
    if (!runs) continue
    const existing = { kind: 'existing', templateId: row.templateId } as const
    if (row.merchantStart !== null) {
      const atWildcard = runs.a.start === row.merchantStart && runs.a.end === row.merchantStart + 1 && tokens[row.merchantStart] === WILDCARD
      if (atWildcard) return { decision: existing, merchant: runs.b }
      continue
    }
    const learned = withWildcard(tokens, runs.a).join(' ')
    // A template already near the cap may grow by the wildcard; it then keeps its words rather than refuse the push.
    if (learned.length > MAX_TEMPLATE_TEXT) return { decision: existing, merchant: runs.b }
    const learnedRun = { start: runs.a.start, end: runs.a.start + 1, skeleton: learned }
    return { decision: { ...existing, learnedRun }, merchant: runs.b }
  }
  return null
}

const NONE: TemplateMatch = { decision: { kind: 'none' }, merchant: null }

/**
 * The template for a push: one of the person's, a new one, or none. A push with no currency-marked amount gets none,
 * since a template keeps the push's words and such a push keeps no text. So does one whose text is too large to keep
 * (the title is part of the skeleton, so the skeleton's length covers it).
 */
export function decideTemplate(rows: readonly CaptureTemplate[], reading: PushReading, newId: () => string): TemplateMatch {
  if (reading.currencyAmount === null) return NONE
  const found = matchTemplate(rows, reading.skeletonTokens)
  if (found) return found
  if (reading.skeleton.length > MAX_TEMPLATE_TEXT) return NONE
  const template = { templateId: newId(), title: reading.titleSkeleton, skeleton: reading.skeleton }
  return { decision: { kind: 'new', template }, merchant: null }
}
