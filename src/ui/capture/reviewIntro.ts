import { cleanText } from '../../domain/capture/text'
import type { MoneyFormat } from '../../engine/money'
import type { SeedIntro } from '../actions'
import type { ReviewView } from './reviewFields'
import { signedAmount } from './reviewFormat'
import { introNotes } from './reviewNotes'
import { arrivedLabel, pairSentence, whyReasons, type PairSide } from './reviewWhy'

/**
 * What the review view says above its fields: the bank's message as it arrived, why the payment needs a look, the
 * other half of a bill that may be waiting twice, and the lines about a monthly payment or a foreign amount. The message is the push's stored text, else the text the payment
 * was read from; a stranger wrote it, so it is cleaned before it is shown.
 */
export function introOf(
  view: ReviewView,
  pair: PairSide | undefined,
  format: MoneyFormat,
  today: string,
): SeedIntro {
  const message = view.rec.message ?? view.rec.merchantRaw
  return {
    arrived: arrivedLabel(view),
    amount: signedAmount(view, format) || 'No amount',
    message: message ? cleanText(message) : null,
    reasons: whyReasons(view, pair, today),
    notes: introNotes(view),
    ...(pair ? { pair: pairSentence(pair, format) } : {}),
  }
}
