import type { ReviewReason } from '../../domain/capture/review'
import type { MoneyFormat } from '../../engine/money'
import type { ReviewView } from './reviewFields'
import { signedAmount, weekdayDay } from './reviewFormat'
import { notYetCharged, rowTitle } from './reviewRowText'

/** Which of a same-bill pair a payment is, and the other one. */
export interface PairSide {
  role: 'announcement' | 'charge'
  other: ReviewView
}

const BECAUSE: Record<ReviewReason, (view: ReviewView) => string> = {
  'no-amount': () => "the bank's message had no amount",
  'zero-amount': () => 'the amount came through as zero',
  'amount-relearned': () => 'the amount was read from another place in the message than before',
  'no-merchant': () => "the bank's message names no merchant",
  'no-category': () => 'it has no category yet',
  'no-account': (v) => (v.askCard ? 'the card is not linked to an account yet' : 'it has no account yet'),
  foreign: () => 'it is not in euros',
  'own-money': (v) =>
    v.type === null
      ? 'it looks like your own money moving, so the type is yours to pick'
      : 'it looks like an investment, which is yours to confirm',
  'month-edge': () => 'it is close to the edge of a budget month',
  'possible-match': () => 'it may be a duplicate of an entry you already have',
  'new-shape': () => 'the bank worded this message in a new way',
  'new-merchant': () => 'it is the first payment from this merchant',
  'mixed-description': () => 'you have named this merchant in more than one way',
}

/** What a monthly payment's hint asks the person: which of two it is, whether it moved account, whether it was renamed. */
function hintReasons(view: ReviewView): string[] {
  const { hint } = view
  if (hint?.kind === 'choose') return ['it could be either of two monthly payments']
  if (hint?.kind === 'moved')
    return [`you pay ${hint.series.description} from ${view.hintAccount ?? 'another account'}, so it may have moved`]
  if (hint?.kind === 'renamed') return [`you added it as ${hint.votedDescription} before, so it may have been renamed`]
  return []
}

/**
 * Every reason a payment needs a look, in words that follow "because". The duplicate block of the review view shows
 * the entry itself, so a possible duplicate is not said here a second time.
 */
export function whyReasons(
  view: ReviewView,
  pair: PairSide | undefined,
  today: string,
): string[] {
  return [
    ...(pair ? ['it might be the same bill as another one waiting'] : []),
    ...view.reasons.filter((r) => r !== 'possible-match').map((r) => BECAUSE[r](view)),
    ...hintReasons(view),
    ...(view.filled ? ['it was matched to a monthly payment for the first time'] : []),
    ...(notYetCharged(view, today) ? ['the bank announced it and it has not happened yet'] : []),
  ]
}

/** What the review view says about the other half of a same-bill pair, and what to do if they are one bill. */
export function pairSentence(
  pair: PairSide,
  format: MoneyFormat,
): string {
  const { other } = pair
  const amount = signedAmount(other, format)
  if (pair.role === 'charge') {
    const announced = other.fromMessage ? ` on ${weekdayDay(other.fromMessage.arrivedDate)}` : ''
    return `Might be the same bill as the one the bank announced${announced} (${amount}, also waiting). If it's duplicated, add this one and choose Don't add on the other.`
  }
  return `Might be the same bill as ${rowTitle(other).long}, ${amount}, charged ${weekdayDay(other.date)} and also waiting. If it's duplicated, choose Don't add here.`
}

/** When the bank's message arrived, on the phone's clock: "Sun 22 Nov, 12:31". */
export function arrivedLabel(view: ReviewView): string {
  if (view.fromMessage) return `${weekdayDay(view.fromMessage.arrivedDate)}, ${view.fromMessage.arrivedTime}`
  return [weekdayDay(view.date), view.time].filter(Boolean).join(', ')
}
