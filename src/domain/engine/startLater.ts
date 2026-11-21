/**
 * Starting a copy of a scenario at a later date: what it could start from, and what its fields become.
 * The copy counts its years from its own start and its money in the euros of that start, like any
 * scenario; `scenarioAxis` is what puts it beside the others.
 */
import type { GoalScenario } from '../types'
import type { NewGoalScenario } from '../data/dataSource'
import { isCalendarDate, yearsBetween } from './dates'
import { planLineOf, planValueAt } from './planLine'
import { purchaseWithdrawalCents } from './investedStep'
import { projectNetWorth, type YearPoint } from './projection'
import { rebaseline, type Rebaseline } from './rebaselinePatch'
import { valueOnAxisAt } from './scenarioAxis'
import { scenarioToParams } from './scenarioProjection'

type Startable = GoalScenario | NewGoalScenario

export interface SuggestedStart {
  /** The balance to start from, in the euros of the date asked about. */
  cents: number
  /**
   * How much lower than the line's value, less `paidAtStartCents`, `cents` is, so the copy never reads
   * above the line it was read from (see `neverAbove`): 0 for a check-in, which is what was there.
   */
  lowerByCents: number
  /**
   * What the copy takes as already paid by its start, in the euros of the date: a cost (a negative
   * event, the house purchase) dated in its first year, which it cannot place before its first
   * anniversary and so counts as behind it (see `startLater`), and one dated by the start that the
   * line it was read from still pays after it (`aheadOnLine`). Already taken off `cents`; 0 when none.
   */
  paidAtStartCents: number
  /**
   * How much the balance falls short of paying for `paidAtStartCents` (a house in the copy's first year
   * the plan cannot afford by then): `cents` is then 0, since a balance is never negative, and the copy
   * cannot start on that date as planned. 0 when it can.
   */
  shortByCents: number
  /**
   * Where it came from: the check-in on or before the date, the scenario carried on from that
   * check-in, or the scenario's own line when there is no check-in since it started.
   */
  from: 'checkin' | 'plan-from-checkin' | 'own-line'
}

/** The source's start when `date` is on its line (from its start to its last year), else null. */
function onLine(source: Startable, date: string): string | null {
  const start = source.planStartDate
  if (!start || !isCalendarDate(start) || !isCalendarDate(date)) return null
  const years = yearsBetween(start, date)
  return years < 0 || years > source.horizonYears ? null : start
}

/**
 * What a copy of `source` started on `date` could start from, in the euros of that date. The caller
 * passes the latest check-in on or before the date; one after it says nothing about the date and is
 * not used. A check-in on the date itself is its balance. One before it is carried on to the date as the
 * plan from today carries the plan, from that balance, so a few days are a few days of the line's rise.
 * Without a check-in since the source started, it is the source's own line on the date. Null when the
 * source has no start, or the date is before it or past its last year.
 */
export function suggestedStart(
  source: Startable,
  latestCheckin: { investedCents: number; date: string } | null,
  date: string,
  inflationRate: number,
): SuggestedStart | null {
  const start = onLine(source, date)
  if (start === null) return null
  const usable = latestCheckin && isCalendarDate(latestCheckin.date) && latestCheckin.date >= start && latestCheckin.date <= date
  const checkin = usable ? latestCheckin : null
  const paidAtStartCents = paidAtStart(source, date, inflationRate)
  if (checkin && checkin.date === date) {
    return settle({ cents: checkin.investedCents - paidAtStartCents, lowerByCents: 0, paidAtStartCents, from: 'checkin' })
  }
  const [line, since] = checkin
    ? [{ ...source, ...rebaseline(source, checkin, inflationRate).patch }, checkin.date]
    : [source, start]
  const onTheLine = valueOn(line, since, date, inflationRate)
  if (onTheLine === null) return null
  const points = projectNetWorth(scenarioToParams(line, inflationRate))
  const ahead = checkin ? aheadOnLine(source, checkin, date, inflationRate) : NOTHING_AHEAD
  const net = onTheLine - paidAtStartCents - ahead.costCents + ahead.inflowCents
  const cents = neverAbove({ source, points, since, date, inflationRate, inflows: ahead.inflows }, net)
  const paid = paidAtStartCents + ahead.costCents
  return settle({ cents, lowerByCents: net - cents, paidAtStartCents: paid, from: checkin ? 'plan-from-checkin' : 'own-line' })
}

/** A balance that would be below nothing is none, with what it is short by said rather than dropped. */
function settle(s: Omit<SuggestedStart, 'shortByCents'>): SuggestedStart {
  return s.cents < 0 ? { ...s, cents: 0, shortByCents: -s.cents } : { ...s, shortByCents: 0 }
}

/**
 * The costs a copy started on `date` counts as paid by its start that its source pays later: those dated
 * in the copy's first year, which `costsEarly` puts behind the start. In the euros of the date.
 */
function paidAtStart(source: Startable, date: string, inflationRate: number): number {
  const later = rebaseline(source, { date, investedCents: 0 }, inflationRate)
  const early = rebaseline(source, { date, investedCents: 0 }, inflationRate, { costsEarly: true })
  const factor = Math.pow(1 + inflationRate, yearsBetween(source.planStartDate!, date))
  const events = early.droppedLifeEvents
    .filter((e) => !later.droppedLifeEvents.includes(e))
    .reduce((sum, e) => sum - e.amountCents * factor, 0)
  const house = later.house?.to != null && early.house?.to === null ? purchaseWithdrawalCents(scenarioToParams(source, inflationRate)) * factor : 0
  return Math.round(events + house)
}

interface Ahead {
  /** Costs, in the euros of the date. */
  costCents: number
  /** Inflows, in the euros of the date. */
  inflowCents: number
  /** Each inflow as the line holds it: its amount in the line's euros, and the line year it is paid on. */
  inflows: { until: number; cents: number }[]
}

const NOTHING_AHEAD: Ahead = { costCents: 0, inflowCents: 0, inflows: [] }

/**
 * What the source carried on from a check-in still has to pay or receive after `date` though it is dated on or
 * before it. That restart puts what was ahead of the check-in on the check-in's next anniversary, which can fall
 * after the date, while the copy counts anything dated by its start as in its balance. Left in the line's value,
 * a cost would come off later as the "never above" lowering (the right figure for the wrong reason) and an inflow
 * would be taken back off by it, since the copy would hold it months before the line does.
 */
function aheadOnLine(source: Startable, checkin: { investedCents: number; date: string }, date: string, inflationRate: number): Ahead {
  const r = rebaseline(source, checkin, inflationRate)
  const toDate = Math.pow(1 + inflationRate, yearsBetween(source.planStartDate!, date))
  const toLine = Math.pow(1 + inflationRate, yearsBetween(source.planStartDate!, checkin.date))
  const ahead = (c: { from: string; to: string | null }) => c.from <= date && c.to !== null && c.to > date
  const events = r.carried.filter(ahead)
  const costs = events.filter((c) => c.event.amountCents < 0).reduce((sum, c) => sum - c.event.amountCents, 0)
  const house = r.house && ahead(r.house) ? purchaseWithdrawalCents(scenarioToParams(source, inflationRate)) : 0
  const inflows = events.filter((c) => c.event.amountCents > 0)
  return {
    costCents: Math.round((costs + house) * toDate),
    inflowCents: Math.round(inflows.reduce((sum, c) => sum + c.event.amountCents, 0) * toDate),
    inflows: inflows.map((c) => ({ until: yearsBetween(checkin.date, c.to!), cents: c.event.amountCents * toLine })),
  }
}

/** A line's value on a date, in the euros of that date. */
function valueOn(line: Startable, since: string, date: string, inflationRate: number): number | null {
  const value = planValueAt(planLineOf(projectNetWorth(scenarioToParams(line, inflationRate))), yearsBetween(since, date))
  return value === null ? null : Math.round(value * Math.pow(1 + inflationRate, yearsBetween(since, date)))
}

interface Reading {
  source: Startable
  /** The line the balance was read from, and the day its years count from. */
  points: YearPoint[]
  since: string
  date: string
  inflationRate: number
  /** Inflows the copy holds from its start that the line is still to receive (`aheadOnLine`). */
  inflows: { until: number; cents: number }[]
}

/** The copy's invested points from a starting balance, as `startLater` makes it. */
function copyPoints(r: Reading, cents: number): YearPoint[] {
  const patch = rebaseline(r.source, { date: r.date, investedCents: cents }, r.inflationRate, { costsEarly: true }).patch
  return projectNetWorth(scenarioToParams({ ...r.source, ...patch }, r.inflationRate))
}

/**
 * The places the copy can be furthest above the line, in the line's years: every line is straight
 * between its own anniversaries, so the gap between two of them is straight between the anniversaries
 * of either, and its highest point is at one of those.
 */
function corners(r: Reading, copy: YearPoint[]): number[] {
  const offset = yearsBetween(r.since, r.date)
  const end = Math.min(r.points.length - 1, offset + copy.length - 1)
  const own = copy.map((_, k) => offset + k).filter((t) => t <= end)
  const theirs = r.points.map((p) => p.year).filter((t) => t > offset && t <= end)
  return [...own, ...theirs]
}

/** The most the copy started from `cents` reads above the line, in cents of the line's euros, and where. */
function highest(r: Reading, cents: number): { excess: number; at: number } {
  const offset = yearsBetween(r.since, r.date)
  const copy = copyPoints(r, cents)
  // Both sides of each corner: on an anniversary a line is already past that day's step.
  const times = corners(r, copy).flatMap((t) => (t - JUST_BEFORE > offset ? [t, t - JUST_BEFORE] : [t]))
  return times.reduce(
    (most, t) => {
      const due = r.inflows.reduce((sum, i) => (t < i.until ? sum + i.cents : sum), 0)
      const excess = valueOnAxisAt(copy, offset, r.inflationRate, t)! - valueOnAxisAt(r.points, 0, r.inflationRate, t)! - due
      return excess > most.excess ? { excess, at: t } : most
    },
    { excess: 0, at: offset },
  )
}

/** A moment before an anniversary, well outside the whole-year snap in `valueOnAxisAt`. */
const JUST_BEFORE = 1e-6

/** A probe large enough that rounding to a cent does not blur how a cent of the start grows. */
const PROBE = 1_000_000

/**
 * The balance lowered until the copy never reads above the line on any day. The line is straight between
 * its anniversaries and turns a corner on each, where the year's saving lands; a copy started part way
 * through a year turns its corners part way through the line's years, so its straight runs cut above the
 * line's corners, by up to a quarter of how much the yearly rise grows. Its steps are already on the
 * cautious side (`startLater`), so this is what is left: starting it lower by what the worst corner needs
 * keeps every figure it gives cautious, at the price of reading that much under on its own anniversaries.
 * On an anniversary it is a few cents of rounding. Each pass lowers it by what the worst corner left
 * needs, which usually ends it.
 */
function neverAbove(r: Reading, onTheLine: number): number {
  let cents = onTheLine
  for (let pass = 0; ; pass++) {
    const { excess, at } = highest(r, cents)
    if (excess <= 0 || pass === MAX_PASSES) return cents
    const offset = yearsBetween(r.since, r.date)
    const perCent = (valueOnAxisAt(copyPoints(r, cents + PROBE), offset, r.inflationRate, at)! - valueOnAxisAt(copyPoints(r, cents), offset, r.inflationRate, at)!) / PROBE
    cents -= Math.max(1, Math.ceil(excess / perCent))
  }
}

/** Passes before giving up on a line that will not settle; four is the most any test plan has needed. */
const MAX_PASSES = 8

/**
 * The fields of a copy of `source` that starts on `at.date` from `at.investedCents`, and what moved
 * or was dropped on the way. It is a re-baseline to a date that need not be a check-in: what is typed
 * in the euros of the old start is restated in the euros of the new one. Events and the house land on
 * the copy's own anniversaries, which a mid-year start puts between the source's, so each goes on the
 * side that keeps the copy cautious: a cost (a negative event, the house purchase) on the anniversary on
 * or before its date, behind the start when that is the start itself, and an inflow on or after. Paid
 * late, a cost would sit in the copy's balance earning for months its source has spent it, and the copy
 * would read above its source from then to the end. A house bought sooner is also owned sooner, so the
 * copy's net worth reads above its source's while its invested balance reads under (see GOALS-MODEL.md).
 * Null where `suggestedStart` is: a source with no start, or a date before it or past its last year,
 * which a copy cannot start from.
 */
export function startLater(source: Startable, at: { date: string; investedCents: number }, inflationRate: number): Rebaseline | null {
  return onLine(source, at.date) === null ? null : rebaseline(source, at, inflationRate, { costsEarly: true })
}
