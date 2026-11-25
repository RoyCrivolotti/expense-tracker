import type { GoalScenario, Milestone } from '../../../../types'
import type { PlanFromToday } from '../../../../engine'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { crossingYears, scenarioToParams, wholeYearsToAmount, yearsBetween } from '../../../../engine'

export { yearsBetween }
import { tableName } from '../scenarioNames'

export type RowKind = 'plan' | 'saved' | 'fromToday' | 'draft'

export interface MilestoneRow {
  /** Scenario id, 'from-today' or 'draft'; names are not unique, so they cannot key a row. */
  id: string
  kind: RowKind
  name: string
  color: string
  /** How far the search for each milestone went, in years from the row's own start. */
  horizonYears: number
  /** The date the row's own year 0 is. */
  startDate: string
  /** Years from `startDate` to today, to the day: negative when the start is still ahead. */
  elapsedYears: number
  /** `horizonYears` counted from today instead of from the start, at least 1. */
  horizonFromNow: number
  /**
   * Whole years from the row's own start to the first yearly step at or above each milestone;
   * null when it is not within the horizon. Only the calendar year is read from these.
   */
  sinceStart: (number | null)[]
  /** The day each milestone is first reached, in years from the row's own start, before any rounding. */
  offsets: (number | null)[]
  /**
   * The years from today to that day, rounded up once (see `cellFromOffset`), which is what every
   * row shows, what the tint and the gap are made from and where the timeline puts a dot. 0 is
   * already there.
   */
  cells: (number | null)[]
}

interface RowSource {
  id: string
  kind: RowKind
  name: string
  color: string
  startDate: string | null
  params: ReturnType<typeof scenarioToParams>
}

function sourcesOf(
  scenarios: GoalScenario[],
  draft: NewGoalScenario,
  inflationRate: number,
  includeDraft: boolean,
  fromToday: PlanFromToday | null,
): RowSource[] {
  const names = scenarios.map((s) => s.name)
  return [
    ...scenarios.flatMap((s): RowSource[] => [
      {
        id: String(s.id),
        kind: s.isActive ? 'plan' : 'saved',
        name: tableName(s.name, names),
        color: s.color,
        startDate: s.planStartDate,
        params: scenarioToParams(s, inflationRate),
      },
      // The plan from the latest check-in, under the plan: its years count from the check-in.
      ...(fromToday && s.id === fromToday.scenario.id
        ? [
            {
              id: 'from-today',
              kind: 'fromToday' as const,
              name: `${tableName(s.name, names)}, from today`,
              color: s.color,
              startDate: fromToday.since,
              params: scenarioToParams(fromToday.scenario, inflationRate),
            },
          ]
        : []),
    ]),
    // Only when the draft is a line of its own: a loaded scenario with no edits is drawn as
    // the draft on the chart, and a row for both would be the same plan twice.
    ...(includeDraft
      ? [
          {
            id: 'draft',
            kind: 'draft' as const,
            name: `${tableName(draft.name, names)} (editing)`,
            color: draft.color,
            startDate: draft.planStartDate,
            params: scenarioToParams({ ...draft, id: 0 }, inflationRate),
          },
        ]
      : []),
  ]
}

const SAME_DAY = 1e-9

/**
 * A cell counted from today, so that every row is on one footing whatever day its scenario
 * started: the years from now to the day the path reaches the amount, rounded up once. Rounded up
 * on purpose, so "within N years" is the claim that is safe to make. Rounded once for every row: a
 * path restarted on its own line reaches the amount on the same day as before, so it gets the same
 * cell, which two roundings (to a yearly step from its start, and again from today) did not give it.
 * 0 is already there: the path had it at its start, or reached it before today. A path that starts
 * after today has nothing before its start, so what it has at its start it has on that day, the
 * years to which are its cell.
 */
export function cellFromOffset(
  offset: number | null,
  elapsedYears: number,
): number | null {
  if (offset === null) return null
  if (offset <= SAME_DAY && elapsedYears >= 0) return 0
  return Math.max(0, Math.ceil(offset - elapsedYears - SAME_DAY))
}

/** A scenario with no start date starts today, which is what its projection's year 0 is. */
export function buildRows(
  scenarios: GoalScenario[],
  draft: NewGoalScenario,
  milestones: Milestone[],
  inflationRate: number,
  includeDraft: boolean,
  fromToday: PlanFromToday | null,
  today: string,
): MilestoneRow[] {
  return sourcesOf(scenarios, draft, inflationRate, includeDraft, fromToday).map(
    ({ id, kind, name, color, startDate, params }) => {
      const start = startDate ?? today
      const elapsedYears = yearsBetween(start, today)
      const offsets = milestones.map((m) => crossingYears(params, m.amountCents, inflationRate))
      const sinceStart = milestones.map((m) => wholeYearsToAmount(params, m.amountCents, inflationRate))
      return {
        id,
        kind,
        name,
        color,
        horizonYears: params.horizonYears,
        startDate: start,
        elapsedYears,
        horizonFromNow: Math.max(1, Math.ceil(params.horizonYears - elapsedYears)),
        sinceStart,
        offsets,
        cells: offsets.map((offset) => cellFromOffset(offset, elapsedYears)),
      }
    },
  )
}

/** The calendar year `years` whole years after the row's start. */
export function calendarYear(
  row: MilestoneRow,
  years: number,
): number {
  return Number(row.startDate.slice(0, 4)) + years
}

/** The longest horizon among the rows counted from today, which is where the tint's scale ends. */
export function longestHorizon(rows: MilestoneRow[]): number {
  return Math.max(1, ...rows.map((r) => r.horizonFromNow))
}

const TINT_MIN = 5
const TINT_MAX = 31

/**
 * How much of the accent a cell is tinted with, deeper the further away: 5% for the next year
 * to 31% for the longest horizon, on one scale for every row so two cells can be compared by
 * eye. Null where there is no tint to give: already there, or not within the horizon.
 */
export function tintPercent(
  years: number | null,
  longest: number,
): number | null {
  if (years === null || years === 0) return null
  const share = Math.min(1, years / Math.max(1, longest))
  return Math.round(TINT_MIN + (TINT_MAX - TINT_MIN) * share)
}
