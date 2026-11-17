import type { SavedForMerchant } from './merchants'
import type { Candidate, NumberSlot, Slot } from './slots'

/**
 * What a person's decisions on a template's pushes have taught it, one row of `capture_templates`. Everything here is
 * learned from that person alone and never shared.
 */
export interface TemplateFacts {
  accepts: number
  dismissals: number
  /** Dismissals since the last accept. */
  dismissStreak: number
  /** The `index` of the number slot that held the amount the person saved, once one slot answered it alone. */
  amountSlot: number | null
  /** The decimal mark that reading assumed. */
  amountMark: Candidate['mark'] | null
  /** The type of the last row the person saved from this template. */
  type: string | null
  /** The account of the last row saved from a push that showed no card digits. */
  accountId: number | null
  /** When the template stopped being suggested. Null while it is. */
  ignoredAt: string | null
}

/** Dismissals in a row, with no accept ever, after which a template's pushes stop being suggested. */
export const IGNORE_AFTER_DISMISSALS = 3

/** What the person saved, or the row they linked, as far as a template can learn from it. */
export interface SavedRow {
  /** Compared without its sign: an investment taken back out is stored negative. */
  amountCents: number
  type: string
  accountId: number
}

/** The longest outcome `capture_events.outcome` keeps. */
export const MAX_OUTCOME = 60

/**
 * The number slot that holds the amount the person saved: the only one with a reading equal to it. Two slots that
 * read the same cents, or one slot with two readings of them, answer nothing, since a guess here would be learned
 * and then repeated on every later push.
 */
export function chooseAmountSlot(slots: readonly Slot[], savedCents: number): { index: number; mark: Candidate['mark'] } | null {
  const cents = Math.abs(savedCents)
  const matching = slots
    .filter((s): s is NumberSlot => s.kind === 'number' && Array.isArray(s.candidates))
    .map((s) => ({ slot: s, readings: s.candidates.filter((c) => c.cents === cents) }))
    .filter((m) => m.readings.length > 0)
  const [only] = matching
  if (matching.length !== 1 || only?.readings.length !== 1) return null
  return { index: only.slot.index, mark: only.readings[0]!.mark }
}

/**
 * An accept: the person saved the push as a row, or pointed it at one they typed. The template learns the slot that
 * held the amount when one answers it alone, the type (the last accept wins), and the account when the push showed no
 * card digits. A push with digits gets its account from the card link instead, so learning it here would only teach
 * the template one card's account. An accept also ends a dismissal streak and brings an ignored template back.
 */
export function learnFromAccept(facts: TemplateFacts, slots: readonly Slot[], saved: SavedRow, hadDigits: boolean): TemplateFacts {
  const amount = chooseAmountSlot(slots, saved.amountCents)
  return {
    ...facts,
    accepts: facts.accepts + 1,
    dismissStreak: 0,
    amountSlot: amount ? amount.index : facts.amountSlot,
    amountMark: amount ? amount.mark : facts.amountMark,
    type: saved.type,
    accountId: hadDigits ? facts.accountId : saved.accountId,
    ignoredAt: null,
  }
}

/**
 * A dismissal. The third in a row on a template the person has never accepted ignores it from `now` on. One accept
 * ever keeps a template from being ignored this way, since its pushes have been real at least once.
 */
export function learnFromDismiss(facts: TemplateFacts, now: string): TemplateFacts {
  const dismissStreak = facts.dismissStreak + 1
  const ignore = facts.ignoredAt === null && facts.accepts === 0 && dismissStreak >= IGNORE_AFTER_DISMISSALS
  return {
    ...facts,
    dismissals: facts.dismissals + 1,
    dismissStreak,
    ignoredAt: ignore ? now : facts.ignoredAt,
  }
}

/** The payment as the card showed it before the decision. */
export interface ShownRecommendation {
  amountCents: number | null
  suggestedType: string | null
  accountId: number | null
  /** Empty when the card showed none. */
  description: string
  categoryId: number | null
}

/**
 * What the person did, as `capture_events.outcome` keeps it: `added-as-is`, `edited:` and which of amount, type,
 * account, description and category they changed, `linked` or `dismissed`. Descriptions are compared trimmed, so a
 * change of case is an edit.
 */
export function outcomeOf(shown: ShownRecommendation, decision: SavedForMerchant | 'linked' | 'dismissed'): string {
  if (decision === 'linked' || decision === 'dismissed') return decision
  const changed = [
    shown.amountCents !== Math.abs(decision.amountCents) && 'amount',
    shown.suggestedType !== decision.type && 'type',
    shown.accountId !== decision.accountId && 'account',
    shown.description.trim() !== decision.description.trim() && 'description',
    shown.categoryId !== decision.categoryId && 'category',
  ].filter((c): c is string => c !== false)
  return changed.length === 0 ? 'added-as-is' : `edited:${changed.join(',')}`.slice(0, MAX_OUTCOME)
}

/** Whether the push showed card digits: the ones it stored, or a masked-digits slot. */
export function pushHadDigits(last4: string | null, slots: readonly Slot[]): boolean {
  return last4 !== null || slots.some((s) => s.kind === 'masked-digits')
}

/** The slots an event stored, or none when the column is empty or is not a list. */
export function storedSlots(json: string | null): Slot[] {
  if (json === null) return []
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as Slot[]) : []
  } catch {
    return []
  }
}
