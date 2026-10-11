/**
 * Why a check-in is ahead of or behind the plan, in four parts that add up to the gap to the cent.
 * Everything is in the plan's money (euros of the plan start), at the latest check-in `b`, from the first
 * check-in `a` on or after the start. Five paths are read at `b`, each rounded once, and a part is the
 * difference of two of them, so the parts telescope:
 *
 *   V  the plan's line (what the status compares with)
 *   M  the plan's own inputs, the monthly amounts paid as they are (`planOwnPath`)
 *   S  M carried on from the balance actually there at `a`
 *   F  the balance at `a` carried on with the investments that were recorded, at the plan's return
 *   A  the balance actually there
 *
 *   start   what the first check-in already differed from the plan's line by (the status's own gap at
 *           `a`), grown at the plan's return. Measured against V, not M: a balance exactly on the line
 *           has no start part, however long after the start the first check-in is
 *   timing  S - V - start   how the plan counts time within a year, not anything done
 *   saving  F - S   what was put in against what the plan puts in, compounded
 *   market  A - F   everything else: what the market paid against the plan's return, and any money
 *                   that moved without being recorded as an investment
 *
 * A balance that grew by money nobody recorded would read as the market doing well, so when it cannot
 * be told from saving (nothing recorded while the plan expects investing, a house payment or event
 * with no matching withdrawal, a return no market gives) the two are said together.
 */
import type { GoalScenario, Transaction, WealthAccount, WealthCheckin } from '../types'
import { eventHappened, planEvents, planOwnPath, type PlanEvent } from './gapPaths'
import { plannedMonthlyAt } from './contributionSchedule'
import { DAY_MS, utcDateMs } from './dates'
import { isFlow, portfolioReturn, SUSPECT_YEARLY_RETURN } from './portfolioReturn'
import { projectNetWorth } from './projection'
import { scenarioToParams } from './scenarioProjection'
import { distinctCheckins, trackStatus, trackVerdict, yearOffsetFromDate, type TrackStatus } from './wealthTracking'

export interface GapParts {
  timing: number
  start: number
  saving: number
  market: number
}

export type GapUnavailable = 'no-start' | 'few-checkins' | 'too-close' | 'past-horizon'

/** Why saving and the market are said together: what could be told apart is not trusted to be. */
export type MergedReason = 'none-recorded' | 'event-unrecorded' | 'too-high'

export interface GapSplit {
  kind: 'split'
  /** Actual minus plan at the latest check-in, in the plan's money; what `trackStatus` calls `deltaCents`. */
  gapCents: number
  verdict: 'on-track' | 'ahead' | 'behind'
  fromDate: string
  toDate: string
  /** The first check-in came more than a month after the plan started, so the first part covers that too. */
  beforeFirstCheckin: boolean
  parts: GapParts
  merged: MergedReason | null
  /** The recorded investing falls short of the plan's by at least a planned month, which is when the saving row reads less than planned: what was put in and not recorded is in the market. */
  recordedShort: boolean
  /** An investment account has a balance at one check-in and none at the other. */
  accountsChanged: boolean
  /** What the plan invests in a month at the latest check-in, in the plan's money. */
  plannedMonthCents: number
}

export type GapReading = GapSplit | { kind: 'unavailable'; reason: GapUnavailable }

/** Check-ins closer than this are too close to say anything about saving or the market. */
const MIN_DAYS = 30
/** A recorded withdrawal this close to a plan event's anniversary is that event. */
const EVENT_MATCH_DAYS = 45
/** Recorded against planned: at least this share of it counts as the same thing. */
const MATCH_SHARE = 0.5

const unavailable = (reason: GapUnavailable): GapReading => ({ kind: 'unavailable', reason })
const daysBetween = (from: string, to: string) => (utcDateMs(to) - utcDateMs(from)) / DAY_MS

interface Window {
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
function recordedFlows(w: Window, flows: readonly Transaction[]): { grown: number; count: number } {
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

/** Whether some recorded flow is this event: the same direction, on its anniversary give or take a month and a half, and at least half its size. */
function isRecorded(event: PlanEvent, w: Window, flows: readonly Transaction[]): boolean {
  const expected = event.cents * Math.pow(1 + w.inflation, event.year)
  const anniversary = utcDateMs(dateAtAnniversary(w.start, event.year))
  return flows.some(
    (t) =>
      Math.sign(t.amountCents) === Math.sign(expected) &&
      Math.abs(utcDateMs(t.date) - anniversary) <= EVENT_MATCH_DAYS * DAY_MS &&
      Math.abs(t.amountCents) >= MATCH_SHARE * Math.abs(expected),
  )
}

function dateAtAnniversary(start: string, year: number): string {
  return `${Number(start.slice(0, 4)) + year}${start.slice(4)}`
}

/** Whether an investment account was opened or emptied between the two check-ins. */
function accountsChanged(first: WealthCheckin, last: WealthCheckin, accounts: readonly WealthAccount[]): boolean {
  const held = (c: WealthCheckin, id: number) => (c.entries.find((e) => e.accountId === id)?.valueCents ?? 0) !== 0
  return accounts.filter((a) => a.kind === 'investment' && !a.archived).some((a) => held(first, a.id) !== held(last, a.id))
}

/**
 * Round the parts to whole euros so they still add up to the total in whole euros: each is rounded
 * down, then the euros that are left go to the parts that were rounded down the most.
 */
export function wholeEuros(partsCents: readonly number[]): number[] {
  const total = Math.round(partsCents.reduce((s, c) => s + c, 0) / 100)
  const exact = partsCents.map((c) => c / 100)
  const shown = exact.map(Math.floor)
  let left = total - shown.reduce((s, v) => s + v, 0)
  const order = [...exact.keys()].sort((x, y) => exact[y]! - Math.floor(exact[y]!) - (exact[x]! - Math.floor(exact[x]!)))
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length, left--) shown[order[k]!]! += 1
  return shown
}

interface Reading {
  w: Window
  statusA: TrackStatus
  statusB: TrackStatus
}

function readWindow(plan: GoalScenario, checkins: readonly WealthCheckin[], accounts: readonly WealthAccount[], inflation: number): Reading | GapUnavailable {
  const start = plan.planStartDate
  if (!start) return 'no-start'
  const dated = distinctCheckins([...checkins]).filter((c) => c.checkinDate >= start)
  const first = dated[0]
  const last = dated[dated.length - 1]
  if (!first || !last || first === last) return 'few-checkins'
  if (daysBetween(first.checkinDate, last.checkinDate) < MIN_DAYS) return 'too-close'
  const statusA = trackStatus(first, plan, [...accounts], inflation)
  const statusB = trackStatus(last, plan, [...accounts], inflation)
  const ta = yearOffsetFromDate(start, first.checkinDate)
  const tb = yearOffsetFromDate(start, last.checkinDate)
  if (!statusA || !statusB || ta === null || tb === null) return 'past-horizon'
  return { w: { start, first, last, between: dated, ta, tb, rate: plan.expectedRealReturn, inflation }, statusA, statusB }
}

/** Why saving and the market cannot be said apart, if they cannot. */
function mergedReason(
  r: Reading,
  plan: GoalScenario,
  events: readonly PlanEvent[],
  flows: readonly Transaction[],
  accounts: readonly WealthAccount[],
  recorded: number,
): MergedReason | null {
  const { w } = r
  if (recorded === 0 && plannedMonthlyAt(plan, w.last.checkinDate) > 0) return 'none-recorded'
  const inWindow = events.filter((e) => eventHappened(e, w.tb, w.start, r.statusB.nearStep) && !eventHappened(e, w.ta, w.start, r.statusA.nearStep))
  if (inWindow.some((e) => !isRecorded(e, w, flows))) return 'event-unrecorded'
  const ret = portfolioReturn(w.between, [...accounts], [...flows])
  return ret !== null && ret.judgedReturn > SUSPECT_YEARLY_RETURN ? 'too-high' : null
}

/**
 * The gap at the latest check-in split into its four parts, or why it cannot be: no start date, fewer
 * than two check-ins on or after it, two that are under a month apart, or a latest one past the plan's
 * last year.
 */
export function splitGap(
  plan: GoalScenario,
  checkins: readonly WealthCheckin[],
  accounts: readonly WealthAccount[],
  transactions: readonly Transaction[],
  inflationRate: number,
): GapReading {
  const read = readWindow(plan, checkins, accounts, inflationRate)
  if (typeof read === 'string') return unavailable(read)
  const { w, statusA, statusB } = read
  const params = scenarioToParams(plan, inflationRate)
  const events = planEvents(projectNetWorth(params))
  const ownA = planOwnPath(params, events, w.ta, (e) => eventHappened(e, w.ta, w.start, statusA.nearStep))
  const ownB = planOwnPath(params, events, w.tb, (e) => eventHappened(e, w.tb, w.start, statusB.nearStep))
  const growth = Math.pow(1 + w.rate, w.tb - w.ta)
  const flows = transactions.filter(isFlow)
  const recorded = recordedFlows(w, flows)

  const carried = ownB + (statusA.actualRealInvestedCents - ownA) * growth
  const withFlows = statusA.actualRealInvestedCents * growth + recorded.grown
  const [s, f] = [Math.round(carried), Math.round(withFlows)]
  const start = Math.round(statusA.deltaCents * growth)
  const plannedMonthCents = Math.round(plannedMonthlyAt(plan, w.last.checkinDate) / Math.pow(1 + inflationRate, w.tb))
  const merged = mergedReason(read, plan, events, flows, accounts, recorded.count)

  return {
    kind: 'split',
    gapCents: statusB.deltaCents,
    verdict: trackVerdict(statusB),
    fromDate: w.first.checkinDate,
    toDate: w.last.checkinDate,
    beforeFirstCheckin: daysBetween(w.start, w.first.checkinDate) > MIN_DAYS,
    parts: {
      start,
      timing: s - statusB.projectedInvestedCents - start,
      saving: f - s,
      market: statusB.actualRealInvestedCents - f,
    },
    merged,
    recordedShort: merged === null && plannedMonthCents > 0 && f - s <= -plannedMonthCents,
    accountsChanged: accountsChanged(w.first, w.last, accounts),
    plannedMonthCents,
  }
}

/** A restart is only worth suggesting when the gap is at least this many planned months of investing. */
const RESTART_MIN_MONTHS = 3
/** And when where the plan started explains between this share of the gap and its mirror above. */
const RESTART_SHARE = [0.5, 1.5] as const

/**
 * Whether the gap is the plan's starting point rather than anything done since: the start part is on the
 * same side as the gap and about the size of it (between half and one and a half times), and the gap is
 * worth at least three months of what the plan invests, since a smaller one is noise and a plan that is
 * paused has no month to count. Then restarting the plan from the latest check-in is the fix, not saving.
 */
export function startExplainsGap(split: GapSplit): boolean {
  const { gapCents, parts, plannedMonthCents } = split
  if (plannedMonthCents <= 0 || Math.abs(gapCents) < RESTART_MIN_MONTHS * plannedMonthCents) return false
  const share = parts.start / gapCents
  return share >= RESTART_SHARE[0] && share <= RESTART_SHARE[1]
}
