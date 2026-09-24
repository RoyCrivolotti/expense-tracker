/**
 * What a re-baseline changes. Moving the plan's start to the latest check-in moves the
 * calendar every projection year maps to, and life events and the house purchase are
 * keyed by projection year, so left alone they would replay from the new start: an
 * inheritance already inside the balance would be added again a year on. They keep
 * their calendar dates instead: an event dated on or before the check-in is dropped,
 * since its money is in the balance the plan restarts from, and a later one lands on
 * the first anniversary of the new start at or after its date. A plan whose
 * contribution grows each year has grown for the years that passed, and restarts from
 * that.
 */
import type { GoalScenario, LifeEvent } from '../types'
import { utcDateMs } from './dates'
import { formatCents, type MoneyFormat } from './money'
import { yearOffsetFromDate } from './wealthTracking'

export interface RebaselinePatch {
  startInvestedCents: number
  planStartDate: string
  lifeEvents: LifeEvent[]
  housePurchaseYear: number | null
  monthlyContributionCents: number
}

/** A life event with the date it had and the one it now has; null when it is dropped. */
export interface CarriedEvent {
  event: LifeEvent
  from: string
  to: string | null
}

export interface Rebaseline {
  /** The fields to write; nothing else, so the patch can go straight to the scenario. */
  patch: RebaselinePatch
  /** Events dated on or before the check-in, left out of the patch. */
  droppedLifeEvents: LifeEvent[]
  /** Every event's old and new date, for saying what moved. Empty without an old start. */
  carried: CarriedEvent[]
  /** The house purchase's old and new date; `to` is null when it is now behind the start. */
  house: { from: string; to: string | null } | null
  /** What the plan started from before, for saying what is being replaced. */
  previous: { investedCents: number; planStartDate: string | null; monthlyContributionCents: number }
  /** Whole years the start moved by; positive when it moved later. */
  shiftedYears: number
}

type Rebaselinable = Pick<
  GoalScenario,
  | 'planStartDate'
  | 'lifeEvents'
  | 'housePurchaseYear'
  | 'startInvestedCents'
  | 'monthlyContributionCents'
  | 'annualContributionGrowth'
>

/** The same day of the year, `years` on, by the calendar rather than in days. */
function anniversary(iso: string, years: number): string {
  const d = new Date(utcDateMs(iso))
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d.toISOString().slice(0, 10)
}

/**
 * Plan year `year` of the old start, as a plan year of the new one: the first anniversary
 * of the new start on or after the old date, never below one. Null when that date is on
 * or before the check-in, which is what "already happened" means here.
 */
function carriedYear(year: number, oldStart: string, newStart: string, checkin: string): number | null {
  const date = anniversary(oldStart, year)
  if (date <= checkin) return null
  let k = 1
  while (anniversary(newStart, k) < date) k += 1
  return k
}

export function rebaseline(
  scenario: Rebaselinable,
  latest: { investedCents: number; date: string },
): Rebaseline {
  const oldStart = scenario.planStartDate
  const shiftedYears = oldStart ? Math.round(yearOffsetFromDate(oldStart, latest.date) ?? 0) : 0
  const years = scenario.lifeEvents.map((event) =>
    oldStart ? carriedYear(event.year, oldStart, latest.date, latest.date) : event.year,
  )
  const lifeEvents: LifeEvent[] = []
  const droppedLifeEvents: LifeEvent[] = []
  scenario.lifeEvents.forEach((event, i) => {
    const year = years[i] ?? null
    if (year === null) droppedLifeEvents.push(event)
    else lifeEvents.push({ ...event, year })
  })
  const carried: CarriedEvent[] = oldStart
    ? scenario.lifeEvents.map((event, i) => {
        const year = years[i] ?? null
        return {
          event,
          from: anniversary(oldStart, event.year),
          to: year === null ? null : anniversary(latest.date, year),
        }
      })
    : []
  // A purchase now on or behind the start is a house owned from day one, which is year 0.
  const purchase = scenario.housePurchaseYear
  const housePurchaseYear =
    purchase === null || !oldStart ? purchase : (carriedYear(purchase, oldStart, latest.date, latest.date) ?? 0)
  const house =
    oldStart && purchase !== null && purchase > 0 && housePurchaseYear !== null
      ? {
          from: anniversary(oldStart, purchase),
          to: housePurchaseYear > 0 ? anniversary(latest.date, housePurchaseYear) : null,
        }
      : null
  const monthlyContributionCents = Math.round(
    scenario.monthlyContributionCents * Math.pow(1 + scenario.annualContributionGrowth, Math.max(0, shiftedYears)),
  )
  return {
    patch: {
      startInvestedCents: latest.investedCents,
      planStartDate: latest.date,
      lifeEvents,
      housePurchaseYear,
      monthlyContributionCents,
    },
    droppedLifeEvents,
    carried,
    house,
    previous: {
      investedCents: scenario.startInvestedCents,
      planStartDate: oldStart,
      monthlyContributionCents: scenario.monthlyContributionCents,
    },
    shiftedYears,
  }
}

/**
 * What the re-baseline changes besides the start, one line each, for the editor's note and
 * the Progress confirm sheet: empty when nothing but the start changed. Life events keep
 * their calendar dates as far as whole plan years allow, so a later one can land on the
 * next anniversary of the new start, and the dates say by how much.
 */
export function rebaselineSummary(
  r: Rebaseline,
  format: MoneyFormat,
  formatDate: (iso: string) => string,
): string[] {
  const name = (e: LifeEvent) => e.label || formatCents(e.amountCents, format)
  const lines: string[] = []
  if (r.patch.monthlyContributionCents !== r.previous.monthlyContributionCents) {
    lines.push(
      `Monthly investing goes from ${formatCents(r.previous.monthlyContributionCents, format)} to ${formatCents(r.patch.monthlyContributionCents, format)}, as it has grown since the plan started.`,
    )
  }
  const moved = r.carried.filter((c) => c.to !== null && c.to !== c.from)
  for (const c of moved) {
    lines.push(`${name(c.event)} moves from ${formatDate(c.from)} to ${formatDate(c.to!)}.`)
  }
  if (r.house?.to === null) {
    lines.push(
      `The house purchase (${formatDate(r.house.from)}) is behind the new start, so the plan treats the house as owned from day one.`,
    )
  } else if (r.house && r.house.to !== r.house.from) {
    lines.push(`The house purchase moves from ${formatDate(r.house.from)} to ${formatDate(r.house.to)}.`)
  }
  if (moved.length > 0 || (r.house?.to != null && r.house.to !== r.house.from)) {
    lines.push('Plan years are whole, so a later date lands on the next anniversary of the new start.')
  }
  for (const c of r.carried.filter((x) => x.to === null)) {
    lines.push(`${name(c.event)} (${formatDate(c.from)}) is already in the balance, so it is dropped.`)
  }
  return lines
}
