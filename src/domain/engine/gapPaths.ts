/**
 * The plan's own inputs, carried forward as the plan would carry them, which is what a gap to the
 * plan's line is split against. The line pays each year's contributions at the year's end and draws
 * its years as chords, a cautious convention that is right for a plan and slightly off for a balance
 * that is paid in every month. This is the same plan with the monthly amounts paid as they are
 * (`planOwnPath`), so the difference between the two is the way the plan counts time and nothing a
 * person did.
 */
import { monthlyIntegral } from './contributionSchedule'
import { dateAtYears } from './dates'
import type { ProjectionParams, YearPoint } from './projection'
import type { TrackStatus } from './wealthTracking'

/** What a house payment or life events do to the portfolio on a plan anniversary, in the plan's money. */
export interface PlanEvent {
  year: number
  cents: number
}

/** The events of a projection, read off its yearly points: what each anniversary adds to or takes from the pre-event value. */
export function planEvents(points: readonly YearPoint[]): PlanEvent[] {
  return points
    .filter((p) => p.year > 0 && p.investedCents !== p.preEventInvestedCents)
    .map((p) => ({ year: p.year, cents: p.investedCents - p.preEventInvestedCents }))
}

/**
 * Whether an event has happened by plan offset `at`: on or before its anniversary. A check-in within a
 * month of an anniversary was read against the plan with the step made or not, whichever it was nearer
 * (`TrackStatus.nearStep`), and the event is held to the same reading so the two agree.
 */
export function eventHappened(event: PlanEvent, at: number, start: string, nearStep: TrackStatus['nearStep']): boolean {
  if (nearStep && dateAtYears(start, event.year) === nearStep.date) return nearStep.counted === 'made'
  return event.year <= at
}

/**
 * The plan's own money at plan offset `at`: the starting amount and the monthly amounts as they are
 * paid, all grown at the plan's real return, and each event that has happened. The monthly amount is in
 * euros as sent, so a euro paid at `t` counts as `(1 + inflation)^-t` of the plan's money; with the
 * growth to `at` that is one weight, `((1 + return)(1 + inflation))^-t`, and the integral is the
 * schedule's own.
 */
export function planOwnPath(
  params: ProjectionParams,
  events: readonly PlanEvent[],
  at: number,
  happened: (event: PlanEvent) => boolean,
): number {
  const r = params.expectedRealReturn
  const together = (1 + r) * (1 + params.inflationRate) - 1
  const paid = 12 * monthlyIntegral(params.monthlyContributionCents, params.contributionSteps ?? [], 0, at, together)
  let path = Math.pow(1 + r, at) * (params.startInvestedCents + paid)
  for (const event of events) {
    if (happened(event)) path += event.cents * Math.pow(1 + r, at - event.year)
  }
  return path
}
