import { paymentDirection } from '../../domain/capture/direction'
import type { SeedNotice } from '../actions'
import type { ReviewView } from './reviewFields'
import { weekdayDay } from './reviewFormat'

/**
 * For a payment near a budget month edge: both days it could be dated, and what to check. The other day is the first
 * day the bank might book it on that would be another budget month (see `otherBudgetDays`).
 */
export function monthEdgeNotice(view: ReviewView): SeedNotice | undefined {
  const other = view.edgeDays[0]
  if (!view.reasons.includes('month-edge') || other === undefined) return undefined
  const { time, arrivedDate, arrivedTime } = view.clock
  const paid = `${weekdayDay(view.date)}${time ? ` at ${time}` : ''}`
  const pushed = arrivedDate && arrivedTime ? ` The push arrived ${weekdayDay(arrivedDate)} at ${arrivedTime}.` : ''
  return {
    text: `Budget month edge. The payment is dated ${paid}.${pushed} Your bank may book it on another day, which can move its budget month. Check the date and budget month before adding.`,
    original: { date: view.date, label: weekdayDay(view.date) },
    alternate: { date: other, label: weekdayDay(other) },
  }
}

/**
 * For a payment dated by its bank's words: the day they name, when the push arrived, and a button back to that day.
 * A day after the arrival is a charge (or money coming in) the bank has announced and not yet made.
 */
export function messageDateNotice(view: ReviewView): SeedNotice | undefined {
  const dating = view.fromMessage
  if (!dating) return undefined
  const day = weekdayDay(view.date)
  const ahead = paymentDirection(view.type) === 'in' ? `says it will arrive ${day}` : `says it will be charged ${day}`
  const said = view.date > dating.arrivedDate ? ahead : `dates the payment ${day}`
  return {
    text: `The bank's message ${said}. The push arrived ${weekdayDay(dating.arrivedDate)} at ${dating.arrivedTime}.`,
    original: { date: view.date, label: day },
    alternate: { date: dating.arrivedDate, label: weekdayDay(dating.arrivedDate) },
  }
}
