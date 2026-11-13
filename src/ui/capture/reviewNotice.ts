import type { SeedNotice } from '../actions'
import type { ReviewView } from './reviewFields'
import { weekdayDay } from './reviewFormat'

const pad = (n: number) => String(n).padStart(2, '0')
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** The date a day away from `iso`, in local calendar days. */
function shifted(iso: string, days: number): string {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number)
  return dayOf(new Date(y, m - 1, d + days))
}

/**
 * For a payment near a month end: both days it could be dated, and what to check. The other day is the one the push
 * arrived on when that differs from the payment's, else the day on the other side of the nearer month end.
 */
export function monthEdgeNotice(view: ReviewView): SeedNotice | undefined {
  if (!view.reasons.includes('month-edge')) return undefined
  const arrived = new Date(view.rec.createdAt)
  const arrivedDay = Number.isNaN(arrived.getTime()) ? null : dayOf(arrived)
  const other = arrivedDay !== null && arrivedDay !== view.date ? arrivedDay : shifted(view.date, view.date.endsWith('-01') ? -1 : 1)
  const paid = `${weekdayDay(view.date)}${view.time ? ` at ${view.time}` : ''}`
  const pushed = arrivedDay === null ? '' : ` The push arrived ${weekdayDay(arrivedDay)} at ${timeOf(arrived)}.`
  return {
    text: `Month end. The payment is dated ${paid}.${pushed} Your bank may book it on the other side of the month, which can move its budget month. Check the date and budget month before adding.`,
    original: { date: view.date, label: weekdayDay(view.date) },
    alternate: { date: other, label: weekdayDay(other) },
  }
}
