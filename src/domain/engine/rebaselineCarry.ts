/**
 * Where a re-baseline puts what is dated: life events and the house purchase keep their calendar dates,
 * on whole plan years of the new start, and what is on or before it is behind it.
 */
import type { LifeEvent } from '../types'
import { utcDateMs } from './dates'
import type { CarriedEvent, Rebaseline } from './rebaselinePatch'

/** The same day of the year, `years` on, by the calendar rather than in days. */
export function anniversary(iso: string, years: number): string {
  const d = new Date(utcDateMs(iso))
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d.toISOString().slice(0, 10)
}

/**
 * Plan year `year` of the old start, as a plan year of the new one: the first anniversary
 * of the new start on or after the old date, never below one. Null when that date is on
 * or before the check-in, which is what "already happened" means here.
 */
export function carriedYear(year: number, oldStart: string, newStart: string, checkin: string): number | null {
  const date = anniversary(oldStart, year)
  if (date <= checkin) return null
  let k = 1
  while (anniversary(newStart, k) < date) k += 1
  return k
}

/** The life events on their calendar dates, in the euros of the new start, and what dropped out and moved. */
export function carryEvents(
  events: LifeEvent[],
  oldStart: string | null,
  date: string,
  restate: (cents: number) => number,
): { lifeEvents: LifeEvent[]; droppedLifeEvents: LifeEvent[]; carried: CarriedEvent[] } {
  const years = events.map((event) => (oldStart ? carriedYear(event.year, oldStart, date, date) : event.year))
  const lifeEvents: LifeEvent[] = []
  const droppedLifeEvents: LifeEvent[] = []
  events.forEach((event, i) => {
    const year = years[i] ?? null
    if (year === null) droppedLifeEvents.push(event)
    else lifeEvents.push({ ...event, year, amountCents: restate(event.amountCents) })
  })
  const carried: CarriedEvent[] = oldStart
    ? events.map((event, i) => {
        const year = years[i] ?? null
        return { event, from: anniversary(oldStart, event.year), to: year === null ? null : anniversary(date, year) }
      })
    : []
  return { lifeEvents, droppedLifeEvents, carried }
}

/**
 * The purchase year on the new start, and its old and new date. A purchase now on or behind the start
 * is a house owned from day one, which is year 0, and a house owned from day one stays so, whichever
 * way the date moves.
 */
export function carryPurchase(
  purchase: number | null,
  oldStart: string | null,
  date: string,
): { housePurchaseYear: number | null; house: Rebaseline['house'] } {
  const housePurchaseYear =
    purchase === null || purchase === 0 || !oldStart ? purchase : (carriedYear(purchase, oldStart, date, date) ?? 0)
  const house =
    oldStart && purchase !== null && purchase > 0 && housePurchaseYear !== null
      ? {
          from: anniversary(oldStart, purchase),
          to: housePurchaseYear > 0 ? anniversary(date, housePurchaseYear) : null,
        }
      : null
  return { housePurchaseYear, house }
}
