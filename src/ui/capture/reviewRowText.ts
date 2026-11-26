import { paymentDirection } from '../../domain/capture/direction'
import { dayGap } from '../../domain/capture/duplicate'
import type { ReviewReason } from '../../domain/capture/review'
import { shortDayLabel } from '../format'
import type { ReviewView } from './reviewFields'
import { monthWord, weekdayDay } from './reviewFormat'

/** Where a row is drawn: the Dashboard card, or the "See all" sheet, whose day headings already give the day. */
export type RowPlace = 'card' | 'sheet'

/** How a row's note is drawn: plain, something for the person to decide (amber), a failure (red) or a chip. */
export type NoteTone = 'plain' | 'need' | 'bad' | 'chip'

export interface RowNote {
  text: string
  tone: NoteTone
}

export interface RowTitle {
  /** What the row shows. */
  text: string
  /** What a button names the payment by: the same, or "Unnamed payment" where the row says only "Unnamed". */
  long: string
}

const UNNAMED = { in: 'Unnamed income', out: 'Unnamed payment' } as const

/** The person's own name for the payment, else the merchant, else "Unnamed". Never the bank's sentence. */
export function rowTitle(view: Pick<ReviewView, 'description' | 'unnamed' | 'type'>): RowTitle {
  if (!view.unnamed) return { text: view.description, long: view.description }
  const direction = paymentDirection(view.type)
  return { text: 'Unnamed', long: direction ? UNNAMED[direction] : 'Unnamed movement' }
}

/** A bill the bank announced ahead of the day it names. Null for a payment pushed as it happened or reported late. */
function announcedOn(view: Pick<ReviewView, 'date' | 'fromMessage'>): string | null {
  return view.fromMessage && view.date > view.fromMessage.arrivedDate ? view.fromMessage.arrivedDate : null
}

/** True for an announced payment whose day has not come yet. */
export function notYetCharged(
  view: Pick<ReviewView, 'date' | 'fromMessage'>,
  today: string,
): boolean {
  return announcedOn(view) !== null && view.date > today
}

/** "Today", "Yesterday", else "Tue 24 Nov". */
export function relativeDay(
  iso: string,
  today: string,
): string {
  const ago = dayGap(today, iso)
  return ago === 0 ? 'Today' : ago === 1 ? 'Yesterday' : weekdayDay(iso)
}

/**
 * What sits under the amount: the day on the card, the time in the sheet. A bill still to come says when it will be
 * charged ("Arrives" for money coming in) in both.
 */
export function rowWhen(
  view: Pick<ReviewView, 'date' | 'time' | 'fromMessage' | 'type'>,
  place: RowPlace,
  today: string,
): string {
  if (notYetCharged(view, today))
    return `${paymentDirection(view.type) === 'in' ? 'Arrives' : 'Charges'} ${shortDayLabel(view.date)}`
  if (place === 'card') return relativeDay(view.date, today)
  return view.time ?? (announcedOn(view) ? 'Announced' : shortDayLabel(view.date))
}

/** "Oct or Nov budget?", the two months in calendar order. */
function edgeQuestion(view: Pick<ReviewView, 'budgetMonth' | 'edgeMonth'>): string {
  const months = [view.budgetMonth, view.edgeMonth ?? view.budgetMonth].sort()
  return `${months.map(monthWord).join(' or ')} budget?`
}

type Rule = (
  view: ReviewView,
  place: RowPlace,
  today: string,
) => RowNote | null

const has = (
  view: ReviewView,
  reason: ReviewReason,
) => view.reasons.includes(reason)

const need = (text: string): RowNote => ({ text, tone: 'need' })
const plain = (text: string): RowNote => ({ text, tone: 'plain' })

/**
 * Every note a row can carry, most pressing first. A row shows the first that applies and nothing else: something the
 * person must decide comes before something they are only told, and what the payment is comes last.
 */
const NOTES: readonly Rule[] = [
  (v) => (has(v, 'possible-match') ? { text: 'Possible duplicate', tone: 'chip' } : null),
  (v) => (has(v, 'foreign') ? need('Not in euros') : null),
  (v) => (has(v, 'no-amount') ? need('Amount missing') : null),
  (v) => (has(v, 'zero-amount') ? need('Amount is zero') : null),
  (v) => (has(v, 'amount-relearned') ? need('Check the amount') : null),
  (v) => (has(v, 'own-money') ? need(v.type === null ? 'Pick a type' : 'Check the type') : null),
  (v) => (v.hint?.kind === 'choose' ? need('Which monthly bill?') : null),
  (v) => (has(v, 'no-account') ? need('Which account?') : null),
  (v) => (v.hint?.kind === 'moved' ? need('Check the account') : null),
  (v) => (has(v, 'month-edge') ? need(edgeQuestion(v)) : null),
  (
    v,
    _place,
    today,
  ) =>
    notYetCharged(v, today) ? plain(paymentDirection(v.type) === 'in' ? 'Not arrived yet' : 'Not charged yet') : null,
  (v) => {
    const arrived = announcedOn(v)
    return arrived ? plain(`Notice, ${shortDayLabel(arrived)}`) : null
  },
  (v) => (v.hint && v.hint.kind !== 'choose' ? plain(`Monthly, due ${shortDayLabel(v.hint.series.usualDate)}`) : null),
  (v) => (!v.unnamed && has(v, 'no-category') ? need('No category') : null),
  (
    v,
    place,
  ) => (v.unnamed ? plain(place === 'card' && v.time ? `No merchant, ${v.time}` : 'No merchant named') : null),
  (v) => (has(v, 'mixed-description') ? plain('Name not settled') : null),
  (v) => (has(v, 'new-merchant') ? plain('New merchant') : null),
  (v) => (has(v, 'new-shape') ? plain('New wording') : null),
]

/** The one note under a row's title. A payment that came back after a failed send says so before anything else. */
export function rowNote(
  view: ReviewView,
  place: RowPlace,
  today: string,
  failed = false,
): RowNote {
  if (failed) return { text: 'Not sent. Try again', tone: 'bad' }
  for (const rule of NOTES) {
    const note = rule(view, place, today)
    if (note) return note
  }
  return plain(`${view.type === 'refund' ? 'Refund · ' : ''}${view.categoryName ?? ''}`)
}

/** The row's one button: Add only where one tap may add the payment, Review for everything else. */
export function rowButton(view: Pick<ReviewView, 'oneTap'>): 'add' | 'review' {
  return view.oneTap ? 'add' : 'review'
}
