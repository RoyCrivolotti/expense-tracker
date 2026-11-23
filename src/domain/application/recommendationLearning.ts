/** What a recommendation's decision teaches: the push's template and the merchant's name, from the row the person saved. */
import { learnFromAccept, learnFromDismiss, outcomeOf, pushHadDigits, storedSlots } from '../capture/learn'
import type { SavedRow, ShownRecommendation } from '../capture/learn'
import { merchantKeyOf, merchantVotes, type SavedForMerchant } from '../capture/merchants'
import { bankMerchantName } from '../capture/review'
import type { Slot } from '../capture/slots'
import { suggestFor, type MerchantRow } from '../capture/suggestion'
import { cleanText } from '../capture/text'
import type { CaptureRepository } from '../ports/captureRepository'
import type { Recommendation } from '../ports/captureRecommendations'
import type { RecommendationEvent } from '../ports/captureLearning'
import type { Transaction } from '../types'

/** What a decision learns from the row the person saved or linked. */
export type Saved = SavedRow & SavedForMerchant

export function savedRow(
  t: Pick<Transaction, 'amountCents' | 'type' | 'accountId' | 'description' | 'categoryId'>,
): Saved {
  return {
    amountCents: t.amountCents,
    type: t.type,
    accountId: t.accountId,
    description: t.description,
    categoryId: t.categoryId,
  }
}

/**
 * The payment as the card showed it: the list's suggestion, worked out again from what was known before this decision,
 * so nothing has to be stored on a read. When the suggestion names no description the card fell back to the phone's
 * own history, which the server cannot see, and then to the bank's text; the bank's text is what is compared, since the
 * phone's history rarely names a merchant.
 */
function shownOf(
  rec: Recommendation,
  event: RecommendationEvent,
  slots: Slot[],
  merchants: MerchantRow[],
): ShownRecommendation {
  const s = suggestFor(
    { amountCents: rec.amountCents, accountId: rec.accountId, suggestedType: rec.suggestedType, slots },
    event.facts,
    merchants,
  )
  const bankText = rec.merchantRaw === null ? '' : bankMerchantName(cleanText(rec.merchantRaw))
  return {
    amountCents: s.amountCents,
    suggestedType: s.type,
    accountId: s.accountId,
    description: s.description ?? bankText,
    categoryId: s.categoryId,
  }
}

/**
 * Teaches the template of the push behind a recommendation what the person just decided, and records the outcome on
 * the push. An accept also votes for what the person called the merchant (`merchantVotes`); a dismissal teaches the
 * merchant nothing, since dismissing says the push was not a payment, not what the merchant is called. Called only
 * after this request's decide changed the row, so a retry that lost the race teaches nothing. `rec` is the
 * recommendation as it was before the decision. Best effort: the decision has been made whatever happens here, so a
 * failure is logged by its class alone (a message could quote the push) and the request still succeeds.
 */
export async function learnAfterDecision(
  captures: CaptureRepository,
  owner: string,
  rec: Recommendation,
  decision: { kind: 'submitted' | 'linked'; saved: Saved } | { kind: 'dismissed' },
  now: Date,
): Promise<void> {
  try {
    // An add is compared with the suggestion the card showed, which needs the merchant's rows as they were.
    const key = decision.kind === 'submitted' ? merchantKeyOf(rec.merchantRaw) : null
    const [event, merchants] = await Promise.all([
      captures.eventOfRecommendation(owner, rec.id),
      key === null ? Promise.resolve([]) : captures.merchantRows(owner, key),
    ])
    if (!event) return
    const { facts, templateId } = event
    const slots = storedSlots(event.slots)
    const outcome =
      decision.kind === 'submitted' ? outcomeOf(shownOf(rec, event, slots, merchants), decision.saved) : decision.kind
    const votes = decision.kind === 'dismissed' ? [] : merchantVotes(rec.merchantRaw, decision.saved)
    const at = now.toISOString()
    const learned =
      facts === null || templateId === null
        ? null
        : {
            templateId,
            facts:
              decision.kind === 'dismissed'
                ? learnFromDismiss(facts, at)
                : learnFromAccept(facts, slots, decision.saved, pushHadDigits(event.last4, slots)),
          }
    await captures.applyDecisionLearning(owner, rec.id, { template: learned, merchants: votes, outcome, at })
  } catch (error) {
    console.error('capture: learning failed', error instanceof Error ? error.name : 'unknown')
  }
}
