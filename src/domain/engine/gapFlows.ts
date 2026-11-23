/**
 * The recorded investments and withdrawals behind a gap split: which of them fall inside the window between two
 * check-ins, and which plan event a recorded withdrawal is.
 */
import type { Transaction, WealthCheckin } from '../types'
import { eventHappened, type PlanEvent } from './gapPaths'
import { DAY_MS, utcDateMs } from './dates'
import type { TrackStatus } from './wealthTracking'
import { yearOffsetFromDate } from './wealthTracking'

/** A recorded withdrawal this close to a plan event's anniversary is that event. */
const EVENT_MATCH_DAYS = 45
/** Recorded against planned: at least this share of it counts as the same thing. */
const MATCH_SHARE = 0.5

export interface Window {
  start: string
  first: WealthCheckin
  last: WealthCheckin
  /** Every check-in from the first to the last, one for each day. */
  between: WealthCheckin[]
  ta: number
  tb: number
  rate: number
  inflation: number
}

/** The recorded investments in the window, each in the plan's money and grown to the latest check-in, and how many. */
export function recordedFlows(
  w: Window,
  flows: readonly Transaction[],
): { grown: number; count: number } {
  let grown = 0
  let count = 0
  for (const t of flows) {
    // A check-in is the balance at the end of its day: a flow on the first is inside it already, one on the last counts with no time to grow.
    if (t.date <= w.first.checkinDate || t.date > w.last.checkinDate) continue
    const at = yearOffsetFromDate(w.start, t.date)
    if (at === null) continue
    grown += (t.amountCents / Math.pow(1 + w.inflation, at)) * Math.pow(1 + w.rate, w.tb - at)
    count += 1
  }
  return { grown, count }
}

/** The recorded flow that is this event, if any: the same direction, on its anniversary give or take a month and a half, and at least half its size. */
export function matchingFlow(
  event: PlanEvent,
  w: Window,
  flows: readonly Transaction[],
): Transaction | undefined {
  const expected = event.cents * Math.pow(1 + w.inflation, event.year)
  const anniversary = utcDateMs(dateAtAnniversary(w.start, event.year))
  return flows.find(
    (t) =>
      Math.sign(t.amountCents) === Math.sign(expected) &&
      Math.abs(utcDateMs(t.date) - anniversary) <= EVENT_MATCH_DAYS * DAY_MS &&
      Math.abs(t.amountCents) >= MATCH_SHARE * Math.abs(expected),
  )
}

export const isRecorded = (
  event: PlanEvent,
  w: Window,
  flows: readonly Transaction[],
) => matchingFlow(event, w, flows) !== undefined

/**
 * Whether an event is in the balance of a check-in. A payment that was recorded is in it from the day it was made,
 * whatever the anniversary says, so one made a month early is not under-saving and one a month late is not
 * over-saving; with nothing recorded it is the plan's own reading (`eventHappened`).
 */
export function eventCounted(
  event: PlanEvent,
  at: number,
  checkinDate: string,
  nearStep: TrackStatus['nearStep'],
  w: Window,
  flows: readonly Transaction[],
): boolean {
  const flow = matchingFlow(event, w, flows)
  return flow !== undefined ? flow.date <= checkinDate : eventHappened(event, at, w.start, nearStep)
}

function dateAtAnniversary(
  start: string,
  year: number,
): string {
  return `${Number(start.slice(0, 4)) + year}${start.slice(4)}`
}
