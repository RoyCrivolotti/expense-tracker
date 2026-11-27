import { paymentDirection } from '../../domain/capture/direction'
import type { SeedNote } from '../actions'
import type { ReviewView } from './reviewFields'
import { dueOn, foreignAmount } from './reviewFormat'

/**
 * "Looks like your monthly Gym, due 14 Nov, paid from Joint.", or "paid into Joint" for money coming in. The account is
 * named only where the fields do not show it.
 */
function monthlyNote(view: ReviewView): SeedNote[] {
  const { hint } = view
  if (!hint || hint.kind === 'choose') return []
  // A series paid from another account is a question, asked in the "Needs a look" sentence.
  const way = paymentDirection(view.type) === 'in' ? 'into' : 'from'
  const from = view.hintAccount && hint.kind !== 'moved' ? `, paid ${way} ${view.hintAccount}` : ''
  return [
    {
      text: `Looks like your monthly ${hint.series.description}, ${dueOn(hint.series.usualDate)}${from}.`,
      warn: false,
    },
  ]
}

/**
 * The amount as the bank wrote it, which the form leaves empty: cents in another currency are not euros. Money coming
 * in was not charged, so it asks for what it came to.
 */
function foreignNote(view: ReviewView): SeedNote[] {
  if (!view.reasons.includes('foreign') || view.amountCents === null) return []
  const euros = paymentDirection(view.type) === 'in' ? 'it came to' : 'your bank charged'
  return [{ text: `The message says ${foreignAmount(view)}. Type the amount in euros ${euros}.`, warn: true }]
}

/** The lines the review view adds above its fields, beyond the bank's message and the reason. */
export function introNotes(view: ReviewView): SeedNote[] {
  return [...monthlyNote(view), ...foreignNote(view)]
}
