/**
 * Scenarios on one calendar. Each scenario counts its years from its own start and its money in the
 * euros of that start, so two scenarios that start on different days cannot be read side by side
 * year for year. The shared axis starts at the earliest start: a scenario sits on it at the years
 * from there to its own start, and its values are brought to the euros of the axis' start by the
 * inflation between. A scenario that starts on the axis' first day is read exactly as it always was.
 */
import { isCalendarDate, yearsBetween } from './dates'
import { planLineOf, planValueAt, type PlanPoint } from './planLine'
import type { YearPoint } from './projection'

export interface ScenarioAxis {
  /** The earliest start among the scenarios; null when none has a start that is a date. */
  origin: string | null
  /** Each scenario's years from the origin to its own start, in the order given. */
  offsets: number[]
}

/**
 * Where each scenario starts on the shared axis. The origin is the earliest start that is a date; a
 * scenario with no start, or one that is not a day on the calendar, sits at the origin, as it is
 * drawn today. Callers pass every scenario, hidden ones too, so hiding a line never moves the axis.
 */
export function scenarioAxis(starts: readonly (string | null | undefined)[]): ScenarioAxis {
  const dated = starts.map((s) => (s && isCalendarDate(s) ? s : null))
  const origin = dated.reduce<string | null>((min, s) => (s !== null && (min === null || s < min) ? s : min), null)
  return { origin, offsets: dated.map((s) => (s === null || origin === null ? 0 : yearsBetween(origin, s))) }
}

export interface AxisPoint {
  xIndex: number
  value: number
}

/** How much the euros of a start `offsetYears` after the origin are worth in the euros of the origin. */
function deflator(
  offsetYears: number,
  inflationRate: number,
): number {
  return Math.pow(1 + inflationRate, offsetYears)
}

/**
 * A scenario's invested line placed on the shared axis: each anniversary at the axis year it falls on,
 * with the value the day before a step where the year has one, every value in the euros of the origin.
 * At an offset of 0 these are the scenario's own points, untouched.
 */
export function onAxis(
  points: readonly PlanPoint[],
  offsetYears: number,
  inflationRate: number,
): AxisPoint[] {
  const back = deflator(offsetYears, inflationRate)
  return points.flatMap((p) => {
    const xIndex = offsetYears + p.year
    const pre = p.preEventInvestedCents ?? p.investedCents
    const step = pre !== p.investedCents ? [{ xIndex, value: Math.round(pre / back) }] : []
    return [...step, { xIndex, value: Math.round(p.investedCents / back) }]
  })
}

export type AxisField = 'invested' | 'netWorth'

/**
 * A yearly amount between two anniversaries, read on a straight line. A house that is not there at the
 * first of them is bought on the second, on the anniversary, so it (and its loan) is nothing until then.
 */
function between(
  from: number,
  to: number,
  part: number,
): number {
  return from === 0 ? 0 : from + part * (to - from)
}

/** The net worth `years` after the scenario's start: its invested line, plus the house, less the loan. */
function netWorthAt(
  points: readonly YearPoint[],
  years: number,
): number | null {
  const invested = planValueAt(planLineOf(points), years)
  if (invested === null) return null
  const whole = Math.floor(years)
  const here = points[whole]!
  if (years === whole) return invested + here.houseEquityCents - here.mortgageBalanceCents
  const next = points[whole + 1]!
  const part = years - whole
  // The house and the loan are kept once a year. Between anniversaries they are read on a straight line,
  // which is close for a value that grows a few percent a year and a loan paid down month by month.
  const house = between(here.houseEquityCents, next.houseEquityCents, part)
  const loan = between(here.mortgageBalanceCents, next.mortgageBalanceCents, part)
  return Math.round(invested + house - loan)
}

/** How far the scrap of a float subtraction may be from a whole year and still be read as one. */
const SAME_YEAR = 1e-9

/**
 * The years after the scenario's own start that an axis year is. A point drawn at `offset + k` gives
 * back `k` less a scrap of rounding (0,1 + 4 - 0,1 is 3,9999999999999996), which would read the day
 * before the anniversary's step instead of the anniversary, so a figure that close to whole is whole.
 */
function ownYears(
  axisYear: number,
  offsetYears: number,
): number {
  const years = axisYear - offsetYears
  const whole = Math.round(years)
  return Math.abs(years - whole) < SAME_YEAR ? whole : years
}

/**
 * A scenario's value at a year of the shared axis, in the euros of the origin: its own value
 * `axisYear - offsetYears` years after its start, brought back by the inflation between the two
 * starts. Null before the scenario starts and after its last year. On an anniversary it is the value
 * after that day's step, as on the scenario's own line. Every place that shows a scenario's figure on
 * the shared axis reads it here, so they agree to the cent.
 */
export function valueOnAxisAt(
  points: readonly YearPoint[],
  offsetYears: number,
  inflationRate: number,
  axisYear: number,
  field: AxisField = 'invested',
): number | null {
  const years = ownYears(axisYear, offsetYears)
  const own = field === 'invested' ? planValueAt(planLineOf(points), years) : netWorthAt(points, years)
  return own === null ? null : Math.round(own / deflator(offsetYears, inflationRate))
}
