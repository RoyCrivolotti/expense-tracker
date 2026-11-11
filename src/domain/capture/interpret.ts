import { findAmount } from './amount'
import { matchRule } from './classify'
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
    }
  /** A kind not on the list: nothing is kept but a count for this source and day. */
  | { outcome: 'dropped'; source: CaptureSource; localDate: string | null }
  /** A listed kind whose Date cannot be trusted. Listed for the user, never recommended. */
  | { outcome: 'unknown'; reason: 'bad-date' | 'clock-skew'; source: CaptureSource }

export function interpretPush(push: RawPush, receivedMs: number, rules?: readonly KindRule[]): Interpretation {
  const date = parsePushDate(push.date)
  const rule = matchRule(push, rules)
  if (!rule) return { outcome: 'dropped', source: push.source, localDate: date?.localDate ?? null }
  if (!date) return { outcome: 'unknown', reason: 'bad-date', source: push.source }
  if (!withinClockSkew(date.instantMs, receivedMs)) {
    return { outcome: 'unknown', reason: 'clock-skew', source: push.source }
  }
  return recommend(push, rule, date)
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
