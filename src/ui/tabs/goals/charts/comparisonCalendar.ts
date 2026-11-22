import type { GoalScenario } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import {
  dateAtYears,
  fiYearsExact,
  isCalendarDate,
  projectNetWorth,
  scenarioAxis,
  scenarioToParams,
  shortMonthFullYearLabel,
  valueOnAxisAt,
  yearsBetween,
  yearsToFi,
  type AxisField,
  type MoneyFormat,
  type YearPoint,
} from '../../../../engine'
import { formatMoneyShort } from '../chartTheme'

type Dated = Pick<NewGoalScenario, 'planStartDate'>

/**
 * The day the table's shared calendar starts on, when scenarios start on different days; null when they all
 * start on one, and the table reads each at its own plan year as it always has. The draft counts, as on the
 * chart: an edit to its start date moves its row.
 */
export function comparisonOrigin(
  scenarios: readonly Dated[],
  draft: Dated,
): string | null {
  const { origin, offsets } = scenarioAxis([...scenarios, draft].map((s) => s.planStartDate))
  return origin !== null && offsets.some((o) => o > 0) ? origin : null
}

/** A scenario's start on the calendar: its own date, or the origin for one with none, which is where it is drawn. */
function startOf(
  scenario: Dated,
  origin: string,
): string {
  return scenario.planStartDate && isCalendarDate(scenario.planStartDate) ? scenario.planStartDate : origin
}

/** The years from the origin to where the scenario starts. */
export function offsetOf(
  scenario: Dated,
  origin: string,
): number {
  return yearsBetween(origin, startOf(scenario, origin))
}

/** "Jul 2027", the month a date falls in. */
export function monthOf(date: string): string {
  return shortMonthFullYearLabel(date.slice(0, 7))
}

type Scenario = GoalScenario | (NewGoalScenario & { id: number })

/** A row's scenario placed on the calendar, with its projection, ready to be read at any axis year. */
export interface Placed {
  scenario: Scenario
  points: YearPoint[]
  start: string
  offset: number
  /** The axis year of its last plan year. */
  end: number
}

export function place(
  scenario: Scenario,
  origin: string,
  inflationRate: number,
): Placed {
  const points = projectNetWorth(scenarioToParams(scenario, inflationRate))
  const offset = offsetOf(scenario, origin)
  return {
    scenario,
    points,
    start: startOf(scenario, origin),
    offset,
    end: offset + (points[points.length - 1]?.year ?? scenario.horizonYears),
  }
}

/** A float this close to a whole year is that year: starts part-way through one add scraps to it. */
const SCRAP = 1e-9

/** The axis year the table reads every row at with no window chosen. */
export interface RestYear {
  year: number
  /** Every row has a figure there. Otherwise it is the last year shown, where the shorter rows have ended. */
  everyReaches: boolean
}

/**
 * The last whole year every row reaches, or, when there is none (one path ends before another starts), the
 * last year shown: the same year the hero chart rests on, so the table and the chart quote one date.
 */
export function restYear(rows: readonly Placed[]): RestYear {
  const common = Math.floor(Math.min(...rows.map((r) => r.end)) + SCRAP)
  const latestStart = Math.ceil(Math.max(0, ...rows.map((r) => r.offset)) - SCRAP)
  if (latestStart <= common) return { year: common, everyReaches: true }
  return { year: Math.ceil(Math.max(...rows.map((r) => r.end)) - SCRAP), everyReaches: false }
}

export interface Figure {
  text: string
  /** The figure in the origin's euros; null for a row that has not started. */
  cents: number | null
  ended: boolean
}

/**
 * Net worth or invested at an axis year, in the origin's euros, read where the chart reads it. A row that has
 * not started says when it does; one that has ended gives its last figure with the year it ends, so no
 * figure is passed off as being on the date the others are.
 */
export function figureAt(
  row: Placed,
  axisYear: number,
  field: AxisField,
  inflationRate: number,
  format: MoneyFormat,
): Figure {
  const value = valueOnAxisAt(row.points, row.offset, inflationRate, axisYear, field)
  if (value !== null) return { text: formatMoneyShort(value, format), cents: value, ended: false }
  if (axisYear < row.offset) return { text: `starts ${monthOf(row.start)}`, cents: null, ended: false }
  const last = valueOnAxisAt(row.points, row.offset, inflationRate, row.end, field) ?? 0
  const endYear = dateAtYears(row.start, row.end - row.offset).slice(0, 4)
  return { text: `${formatMoneyShort(last, format)} (ended ${endYear})`, cents: last, ended: true }
}

/**
 * FI as the month it is reached in, which every row's start can be read against: the month a path starts in
 * when it has enough from its first day. Bare, as the house is, since the hint says both are months.
 */
export function fiOnCalendar(
  row: Placed,
  inflationRate: number,
): string {
  const { scenario } = row
  const params = scenarioToParams(scenario, inflationRate)
  if (yearsToFi(params, scenario.annualSpendCents, scenario.safeWithdrawalRate) === null) return 'not in horizon'
  const exact = fiYearsExact(params, scenario.annualSpendCents, scenario.safeWithdrawalRate) ?? 0
  return monthOf(dateAtYears(row.start, Math.max(exact, 0)))
}

/** The month the house is bought in, so a purchase moved to another anniversary shows where it moved. */
export function houseOnCalendar(row: Placed): string {
  const year = row.scenario.housePurchaseYear
  if (year === null) return 'never'
  if (year === 0) return 'owned'
  return monthOf(dateAtYears(row.start, year))
}
