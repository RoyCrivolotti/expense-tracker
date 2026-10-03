import type { GoalScenario, Milestone } from '../../../../types'
import type { PlanFromToday } from '../../../../engine'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { scenarioToParams, shortMonthYearLabel, yearsToTargetFromProjection } from '../../../../engine'
import { tableName } from '../scenarioNames'

export type RowKind = 'plan' | 'saved' | 'fromToday' | 'draft'

export interface MilestoneRow {
  /** Scenario id, 'from-today' or 'draft'; names are not unique, so they cannot key a row. */
  id: string
  kind: RowKind
  name: string
  color: string
  /** How far the search for each milestone went. */
  horizonYears: number
  /**
   * The date the row's year 0 is. A row's years count from here, so two rows can only be set
   * against each other when it is the same day.
   */
  startDate: string
  /** Whole years from the start to the first yearly step at or above each milestone; null when it is not within the horizon. */
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
    ({ id, kind, name, color, startDate, params }) => ({
      id,
      kind,
      name,
      color,
      horizonYears: params.horizonYears,
      startDate: startDate ?? today,
      cells: milestones.map((m) => yearsToTargetFromProjection(params, m.amountCents, false)),
    }),
  )
}

/** The calendar year `years` whole years after the row's start. */
export function calendarYear(row: MilestoneRow, years: number): number {
  return Number(row.startDate.slice(0, 4)) + years
}

/** The longest horizon among the rows, which is where the tint's scale ends. */
export function longestHorizon(rows: MilestoneRow[]): number {
  return Math.max(1, ...rows.map((r) => r.horizonYears))
}

const TINT_MIN = 5
const TINT_MAX = 31

/**
 * How much of the accent a cell is tinted with, deeper the further away: 5% for the next year
 * to 31% for the longest horizon, on one scale for every row so two cells can be compared by
 * eye. Null where there is no tint to give: already there, or not within the horizon.
 */
export function tintPercent(years: number | null, longest: number): number | null {
  if (years === null || years === 0) return null
  const share = Math.min(1, years / Math.max(1, longest))
  return Math.round(TINT_MIN + (TINT_MAX - TINT_MIN) * share)
}

export type Gap =
  | { kind: 'same' }
  | { kind: 'years'; years: number }
  | { kind: 'later' }
  | { kind: 'sooner' }
  | { kind: 'neither' }

/**
 * How one path stands against the plan for one milestone, or null where there is nothing fair
 * to say: the plan itself, the plan from today (it counts from another date), and any path
 * that does not start on the plan's day, whose years are counted from somewhere else.
 */
export function gapVersus(row: MilestoneRow, plan: MilestoneRow | null, index: number): Gap | null {
  if (!plan || row.kind === 'plan' || row.kind === 'fromToday' || row.startDate !== plan.startDate) return null
  const mine = row.cells[index] ?? null
  const theirs = plan.cells[index] ?? null
  if (mine === null && theirs === null) return { kind: 'neither' }
  if (mine === null) return { kind: 'later' }
  if (theirs === null) return { kind: 'sooner' }
  return mine === theirs ? { kind: 'same' } : { kind: 'years', years: mine - theirs }
}

const MINUS = '−'

/** The short form under a cell: "−2y", "+3y", "=", or a word where one side never gets there. */
export function gapShort(gap: Gap): string {
  switch (gap.kind) {
    case 'same':
    case 'neither':
      return '='
    case 'later':
      return 'later'
    case 'sooner':
      return 'sooner'
    case 'years':
      return gap.years < 0 ? `${MINUS}${-gap.years}y` : `+${gap.years}y`
  }
}

/** Whether the path is the one ahead of the plan, which the cell shows in green. */
export function gapIsSooner(gap: Gap): boolean {
  return gap.kind === 'sooner' || (gap.kind === 'years' && gap.years < 0)
}

function yearsText(n: number): string {
  return n === 1 ? '1 year' : `${n} years`
}

function gapSentence(gap: Gap, planName: string): string {
  switch (gap.kind) {
    case 'same':
      return ` That is the same as ${planName}.`
    case 'neither':
      return ` ${planName} does not get there either.`
    case 'later':
      return ` That is later than ${planName}, which does get there.`
    case 'sooner':
      return ` That is sooner than ${planName}, which does not get there.`
    case 'years':
      return ` That is ${yearsText(Math.abs(gap.years))} ${gap.years > 0 ? 'later' : 'sooner'} than ${planName}.`
  }
}

function reachedSentence(reachedOn: string | undefined): string {
  return reachedOn ? ` Your check-ins reached it by ${shortMonthYearLabel(reachedOn)}.` : ''
}

function headline(row: MilestoneRow, years: number | null, amount: string): string {
  if (years === 0) return `${row.name} already has ${amount} at its start.`
  if (years === null) return `${row.name} does not reach ${amount} within its ${row.horizonYears} year horizon.`
  return `${row.name} reaches ${amount} in ${yearsText(years)}, by ${calendarYear(row, years)}.`
}

/**
 * One plain sentence for one cell, which is what the readout under the table says and what a
 * screen reader gets for the cell. `amount` is the milestone as it reads in prose (its name and
 * amount); `plan` is passed only while the table is comparing with the plan.
 */
export function describeCell({
  row,
  index,
  amount,
  reachedOn,
  plan,
}: {
  row: MilestoneRow
  index: number
  amount: string
  reachedOn: string | undefined
  plan: MilestoneRow | null
}): string {
  const gap = gapVersus(row, plan, index)
  const versus = gap && plan ? gapSentence(gap, `${plan.name} (the plan)`) : ''
  return headline(row, row.cells[index] ?? null, amount) + versus + reachedSentence(reachedOn)
}

export type CellMove = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'

export const CELL_MOVES: readonly string[] = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']

/** Where an arrow key, Home or End takes the focus from a cell; it stops at the edges. */
export function moveCell(
  at: { row: number; col: number },
  key: CellMove,
  size: { rows: number; cols: number },
): { row: number; col: number } {
  const clamp = (n: number, max: number) => Math.max(0, Math.min(max - 1, n))
  const delta: Record<CellMove, [number, number]> = {
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    Home: [0, -at.col],
    End: [0, size.cols],
  }
  const [dr, dc] = delta[key]
  return { row: clamp(at.row + dr, size.rows), col: clamp(at.col + dc, size.cols) }
}
