import { findAmount } from './amount'
import { matchRule } from './classify'
import { readGeneric } from './generic'
import { parsePushDate, withinClockSkew } from './date'
import type { PushInstant } from './date'
import { kindSign, suggestType } from './suggest'
import { cleanText, findLastFour } from './text'
import type { CaptureSource, KindRule, PushKind, RawPush, SuggestedType } from './types'

/** What the app makes of one push. Only `recommend` ever reaches the user, and only as a suggestion. */
export type Interpretation =
  | {
      outcome: 'recommend'
      kind: PushKind
      suggestedType: SuggestedType
      /** Positive cents, or null when the body gave no amount the parser trusts: incomplete, never guessed. */
      amountCents: number | null
      /** Amount with the direction of the kind, the form balance alerts are paired in. Null when incomplete. */
      signedCents: number | null
      /** Whether the bank wrote a minus sign. Kept apart because the kind, not the text, decides direction. */
      bankWroteMinus: boolean
      lastFour: string | null
      instantMs: number
      localDate: string
      /** The phone's offset from UTC, in minutes, as the Date wrote it. */
      offsetMinutes: number
      /** The cleaned body, for the edit form. Absent for kinds whose body names a person. */
      rawText?: string
      /** The whole cleaned body, kept beside a merchant the words picked out of it, so the person can see what the bank said. */
      excerpt?: string
    }
  /**
   * Not a payment: an advertisement or a push with no single euro amount. Nothing is kept but a count for this source
   * and day, and the reason, which the Worker logs.
   */
  | { outcome: 'dropped'; reason: 'promotional' | 'no-amount'; source: CaptureSource; localDate: string | null }
  /** A listed kind whose Date cannot be trusted. Listed for the user, never recommended. */
  | { outcome: 'unknown'; reason: 'bad-date' | 'clock-skew'; source: CaptureSource }

export function interpretPush(push: RawPush, receivedMs: number, rules?: readonly KindRule[]): Interpretation {
  const date = parsePushDate(push.date)
  const rule = matchRule(push, rules)
  if (!rule) return interpretByWords(push, receivedMs, date)
  if (!date) return { outcome: 'unknown', reason: 'bad-date', source: push.source }
  if (!withinClockSkew(date.instantMs, receivedMs)) {
    return { outcome: 'unknown', reason: 'clock-skew', source: push.source }
  }
  return recommend(push, rule, date)
}

/**
 * A push no bank-specific rule covers is read by its words (generic.ts), so a bank nobody wrote a rule for works at once.
 * What it keeps is the cleaned text of the body, which names a merchant and never a person the app knows of; a push whose
 * date cannot be trusted is listed as unknown, as for a rule.
 */
function interpretByWords(push: RawPush, receivedMs: number, date: PushInstant | null): Interpretation {
  if (!date) {
    const read = readGeneric(push.title, push.body, '1970-01-01')
    return read.outcome === 'drop'
      ? { outcome: 'dropped', reason: read.reason, source: push.source, localDate: null }
      : { outcome: 'unknown', reason: 'bad-date', source: push.source }
  }
  const read = readGeneric(push.title, push.body, date.localDate)
  if (read.outcome === 'drop') return { outcome: 'dropped', reason: read.reason, source: push.source, localDate: date.localDate }
  if (!withinClockSkew(date.instantMs, receivedMs)) return { outcome: 'unknown', reason: 'clock-skew', source: push.source }
  return {
    outcome: 'recommend',
    kind: read.kind,
    suggestedType: suggestType(read.kind),
    amountCents: read.amount.cents,
    signedCents: kindSign(read.kind) * read.amount.cents,
    bankWroteMinus: read.amount.negative,
    lastFour: findLastFour(push.body),
    instantMs: date.instantMs,
    // A charge the bank says is coming is dated by its day, not the push's, so it lands on the day the money leaves.
    localDate: read.dueDate ?? date.localDate,
    offsetMinutes: date.offsetMinutes,
    ...(read.keepsText ? { rawText: read.merchant ?? read.text } : {}),
    ...(read.keepsText && read.merchant !== null ? { excerpt: read.text } : {}),
  }
}

function recommend(push: RawPush, rule: KindRule, date: PushInstant): Interpretation {
  const amount = findAmount(push.body, rule.mark, rule.bareAmount ?? false)
  return {
    outcome: 'recommend',
    kind: rule.kind,
    suggestedType: suggestType(rule.kind),
    amountCents: amount?.cents ?? null,
    signedCents: amount ? kindSign(rule.kind) * amount.cents : null,
    bankWroteMinus: amount?.negative ?? false,
    lastFour: findLastFour(push.body),
    instantMs: date.instantMs,
    localDate: date.localDate,
    offsetMinutes: date.offsetMinutes,
    ...(rule.keepsText ? { rawText: cleanText(push.body) } : {}),
  }
}
