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

export interface Rebaseline {
  /** The fields to write; nothing else, so the patch can go straight to the scenario. */
  patch: RebaselinePatch
  /** Events dated on or before the check-in, left out of the patch. */
  droppedLifeEvents: LifeEvent[]
  /** Whole years the start moved by; positive when it moved later. */
  shiftedYears: number
}

type Rebaselinable = Pick<
  GoalScenario,
  'planStartDate' | 'lifeEvents' | 'housePurchaseYear' | 'monthlyContributionCents' | 'annualContributionGrowth'
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
  const lifeEvents: LifeEvent[] = []
  const droppedLifeEvents: LifeEvent[] = []
  for (const event of scenario.lifeEvents) {
    const year = oldStart ? carriedYear(event.year, oldStart, latest.date, latest.date) : event.year
    if (year === null) droppedLifeEvents.push(event)
    else lifeEvents.push({ ...event, year })
  }
  // A purchase now on or behind the start is a house owned from day one, which is year 0.
  const housePurchaseYear =
    scenario.housePurchaseYear === null || !oldStart
      ? scenario.housePurchaseYear
      : (carriedYear(scenario.housePurchaseYear, oldStart, latest.date, latest.date) ?? 0)
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
    shiftedYears,
  }
}

/**
 * One sentence on what the re-baseline moved, for the editor's note and the Progress
 * confirm sheet; null when nothing but the start changed.
 */
export function rebaselineSummary(r: Rebaseline, format: MoneyFormat): string | null {
  const parts: string[] = []
  const moved = r.patch.lifeEvents.length > 0 || r.patch.housePurchaseYear !== null
  if (r.shiftedYears !== 0 && moved) {
    const n = Math.abs(r.shiftedYears)
    parts.push(
      `Life events and the house purchase moved ${n} year${n === 1 ? '' : 's'} ${r.shiftedYears > 0 ? 'earlier' : 'later'} to keep their dates.`,
    )
  }
  if (r.droppedLifeEvents.length > 0) {
    const names = r.droppedLifeEvents.map((e) => e.label || formatCents(e.amountCents, format)).join(', ')
    parts.push(`Dropped, already behind the new start: ${names}.`)
  }
  return parts.length > 0 ? parts.join(' ') : null
}
