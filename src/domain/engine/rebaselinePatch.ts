/**
 * What a re-baseline changes. Moving the plan's start to the latest check-in moves the
 * calendar every projection year maps to, and life events and the house purchase are
 * keyed by projection year, so left alone they would replay from the new start: an
 * inheritance already inside the balance would be added again a year on. They move with
 * the start instead, and an event now behind it is dropped, since its money is in the
 * balance the plan restarts from.
 */
import type { GoalScenario, LifeEvent } from '../types'
import { formatCents, type MoneyFormat } from './money'
import { yearOffsetFromDate } from './wealthTracking'

export interface RebaselinePatch {
  startInvestedCents: number
  planStartDate: string
  lifeEvents: LifeEvent[]
  housePurchaseYear: number | null
}

export interface Rebaseline {
  /** The fields to write; nothing else, so the patch can go straight to the scenario. */
  patch: RebaselinePatch
  /** Events now behind the new start, left out of the patch. */
  droppedLifeEvents: LifeEvent[]
  /** Whole years the start moved by; positive when it moved later. */
  shiftedYears: number
}

/**
 * The shift is the calendar distance between the old and new start in whole years, ties
 * rounding up, so an event keeps the calendar year it was aimed at. Without an old start
 * nothing has a calendar to keep, and only the balance and date change.
 */
export function rebaseline(
  scenario: Pick<GoalScenario, 'planStartDate' | 'lifeEvents' | 'housePurchaseYear'>,
  latest: { investedCents: number; date: string },
): Rebaseline {
  const shiftedYears = scenario.planStartDate
    ? Math.round(yearOffsetFromDate(scenario.planStartDate, latest.date) ?? 0)
    : 0
  const lifeEvents: LifeEvent[] = []
  const droppedLifeEvents: LifeEvent[] = []
  for (const event of scenario.lifeEvents) {
    const year = event.year - shiftedYears
    if (year < 1) droppedLifeEvents.push(event)
    else lifeEvents.push({ ...event, year })
  }
  // A purchase now behind the start is a house owned from day one, which is year 0.
  const housePurchaseYear =
    scenario.housePurchaseYear === null ? null : Math.max(0, scenario.housePurchaseYear - shiftedYears)
  return {
    patch: { startInvestedCents: latest.investedCents, planStartDate: latest.date, lifeEvents, housePurchaseYear },
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
