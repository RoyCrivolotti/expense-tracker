import type { TemplateFacts } from './learn'
import { ANY_AMOUNT } from './merchants'
import { MIN_SIGHTINGS } from './review'
import type { Slot } from './slots'
import { foldTitle } from './text'
import type { SuggestedType } from './types'

/**
 * Why a suggestion needs a look that the push alone would not show: the person has never accepted a push of this
 * wording, or the amount the template learned to read differs from the one the push was first read with.
 */
export type SuggestionReason = 'new-shape' | 'amount-relearned'

/**
 * What a captured push should become, from the person's own decisions on earlier pushes. Worked out when the list is
 * read and never stored, so it always follows what was learned last.
 */
export interface Suggestion {
  /** The person's own description for the merchant, or null when they have given it none yet. */
  description: string | null
  categoryId: number | null
  type: SuggestedType | null
  accountId: number | null
  amountCents: number | null
  /** Votes behind `description`: at the payment's price when that price has any, else at every price. */
  sightings: number
  /** The description leads every other strictly and has at least `MIN_SIGHTINGS` votes. */
  settled: boolean
  reasons: SuggestionReason[]
}

/** The recommendation as the Worker first read it, and the slots of the push behind it. */
export interface SuggestionInput {
  amountCents: number | null
  accountId: number | null
  suggestedType: SuggestedType | null
  slots: readonly Slot[]
}

/** One row of the person's memory of a merchant (`capture_merchants`). */
export interface MerchantRow {
  /** The price the row counts, or `ANY_AMOUNT`. */
  amountCents: number
  description: string
  categoryId: number | null
  votes: number
  lastSeen: string
}

const SUGGESTED_TYPES: ReadonlySet<string> = new Set<SuggestedType>(['expense', 'income', 'investment', 'refund'])

/**
 * The amount the template learned to read, when it reads one: the number at the learned slot with the learned decimal
 * mark, or its only reading. Only a number with a currency marker counts. The slot is a token position, and a merchant
 * of another length moves the numbers after it, so a position that now holds some other number must not be read.
 */
function learnedAmount(
  template: TemplateFacts | null,
  slots: readonly Slot[],
): number | null {
  if (template?.amountSlot == null) return null
  const slot = slots.find((s) => s.index === template.amountSlot)
  if (slot?.kind !== 'number' || slot.currency === null) return null
  const reading =
    slot.candidates.find((c) => c.mark === template.amountMark) ??
    (slot.candidates.length === 1 ? slot.candidates[0] : undefined)
  return reading?.cents ?? null
}

const isNewer = (
  a: MerchantRow,
  b: MerchantRow,
) => a.lastSeen > b.lastSeen || (a.lastSeen === b.lastSeen && a.votes > b.votes)

/**
 * The description the rows vote for. Descriptions are compared folded (case and accents) and their votes summed, and
 * the label is the most recently used spelling, with its category. Most votes wins, a tie to the more recently used.
 * It is settled under the rule the phone's own history uses (`review.ts`), with votes standing in for typed rows.
 */
function vote(
  rows: readonly MerchantRow[],
): Pick<Suggestion, 'description' | 'categoryId' | 'sightings' | 'settled'> | null {
  if (rows.length === 0) return null
  const groups = new Map<string, { votes: number; newest: MerchantRow }>()
  for (const row of rows) {
    const key = foldTitle(row.description)
    const held = groups.get(key)
    if (!held) groups.set(key, { votes: row.votes, newest: row })
    else groups.set(key, { votes: held.votes + row.votes, newest: isNewer(row, held.newest) ? row : held.newest })
  }
  const ranked = [...groups.values()].sort((a, b) => b.votes - a.votes || (isNewer(b.newest, a.newest) ? 1 : -1))
  const [first, second] = ranked as [(typeof ranked)[number], (typeof ranked)[number] | undefined]
  return {
    description: first.newest.description,
    categoryId: first.newest.categoryId,
    sightings: ranked.reduce((sum, g) => sum + g.votes, 0),
    settled: first.votes >= MIN_SIGHTINGS && first.votes > (second?.votes ?? 0),
  }
}

/**
 * What a push should become. The amount is the one the template learned to read when it reads one, else the first
 * reading. The description and category come from the merchant's rows at the payment's price when it has any, since one
 * merchant name can stand for several fixed prices, else from its rows at any price, else none, and the app falls back
 * to the phone's own history and then the bank's text. The type is the template's, else the first guess. The account
 * is the card's link, else the template's.
 *
 * `template` is null when the push has no template; that counts as one the person never accepted, so one tap never
 * adds a push of a wording before the person has accepted one. `merchantRows` are the rows of this push's merchant only.
 */
export function suggestFor(
  rec: SuggestionInput,
  template: TemplateFacts | null,
  merchantRows: readonly MerchantRow[],
): Suggestion {
  const learned = learnedAmount(template, rec.slots)
  const amountCents = learned ?? rec.amountCents
  return {
    ...merchantDescription(merchantRows, amountCents),
    type: typeOf(template, rec.suggestedType),
    accountId: rec.accountId ?? template?.accountId ?? null,
    amountCents,
    reasons: reasonsOf(template, learned, rec.amountCents),
  }
}

const NO_DESCRIPTION = { description: null, categoryId: null, sightings: 0, settled: false }

/**
 * The description and category from the merchant's rows at this price or at any price. The price's rows win when they
 * are settled, or when they name something other than the settled winner at any price: a subscription at a fixed price
 * that shares its merchant's name with other purchases. Otherwise a thin price row would hide what the merchant's whole
 * history agrees on (one add at 3,40 against ten at other prices), so the rows at any price speak.
 */
function merchantDescription(
  rows: readonly MerchantRow[],
  amountCents: number | null,
) {
  const atPrice = amountCents === null ? null : vote(rows.filter((r) => r.amountCents === amountCents))
  const anyPrice = vote(rows.filter((r) => r.amountCents === ANY_AMOUNT))
  const differs =
    atPrice !== null &&
    anyPrice?.settled === true &&
    foldTitle(atPrice.description ?? '') !== foldTitle(anyPrice.description ?? '')
  if (atPrice?.settled || differs) return atPrice
  return anyPrice ?? atPrice ?? NO_DESCRIPTION
}

function typeOf(
  template: TemplateFacts | null,
  firstGuess: SuggestedType | null,
): SuggestedType | null {
  const learned = template?.type
  return learned != null && SUGGESTED_TYPES.has(learned) ? (learned as SuggestedType) : firstGuess
}

function reasonsOf(
  template: TemplateFacts | null,
  learned: number | null,
  firstReading: number | null,
): SuggestionReason[] {
  const reasons: SuggestionReason[] = []
  if (template === null || template.accepts === 0) reasons.push('new-shape')
  if (learned !== null && learned !== firstReading) reasons.push('amount-relearned')
  return reasons
}
