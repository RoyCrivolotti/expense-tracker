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
  /**
   * The same steps counted from today (see `yearsFromNow`), which is what every row shows, what
   * the tint and the gap are made from and where the timeline puts a dot. 0 is already there.
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

function utcDay(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day)
}

/**
 * The years from one date to a later one (both `YYYY-MM-DD`), to the day: the whole anniversaries
 * passed, then the part of the year since the last one. Negative when `to` is the earlier date.
 */
export function yearsBetween(from: string, to: string): number {
  if (to < from) return -yearsBetween(to, from)
  const [fy = 0, fm = 1, fd = 1] = from.split('-').map(Number)
  const [ty = 0, tm = 1, td = 1] = to.split('-').map(Number)
  const end = utcDay(ty, tm, td)
  let whole = ty - fy
  if (utcDay(fy + whole, fm, fd) > end) whole -= 1
  const last = utcDay(fy + whole, fm, fd)
  const next = utcDay(fy + whole + 1, fm, fd)
  return whole + (end - last) / (next - last)
}

/**
 * A cell counted from today, so that every row is on one footing whatever day its scenario
 * started: the first whole year from now at or after the step the path reaches the amount in.
 * Rounded up on purpose: the step is the first yearly one at or above the amount, so the real
 * date is within the year before it and "within N years" is the claim that is safe to make. For a
 * path that started less than a year ago it is the number the path itself gives. 0 is already
 * there: the path had it at its start, or reached it before today.
 */
export function yearsFromNow(sinceStart: number | null, elapsedYears: number): number | null {
  if (sinceStart === null) return null
  if (sinceStart === 0) return 0
  return Math.max(0, Math.ceil(sinceStart - elapsedYears))
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
      const sinceStart = milestones.map((m) => yearsToTargetFromProjection(params, m.amountCents, false))
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
        cells: sinceStart.map((n) => yearsFromNow(n, elapsedYears)),
      }
    },
  )
}

/** The calendar year `years` whole years after the row's start. */
export function calendarYear(row: MilestoneRow, years: number): number {
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
 * How one path stands against the plan for one milestone, or null for the plan itself and when
 * there is no plan. Both sides are the years from today that the table shows, so whatever day a
 * path started on the figure is the difference between the two cells on screen.
 */
export function gapVersus(row: MilestoneRow, plan: MilestoneRow | null, index: number): Gap | null {
  if (!plan || row.kind === 'plan') return null
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

/** "1 year" or "6 years". */
export function yearsText(n: number): string {
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

/** What a path does not reach: the end of its horizon is `horizonFromNow` years away. */
export function beyondText(row: MilestoneRow, amounts: string): string {
  return `${row.name} does not reach ${amounts} within its horizon (the next ${row.horizonFromNow} years).`
}

function headline(row: MilestoneRow, index: number, amount: string): string {
  const years = row.cells[index] ?? null
  if (years === null) return beyondText(row, amount)
  const own = row.sinceStart[index] ?? 0
  if (own === 0) return `${row.name} already has ${amount} at its start.`
  if (years === 0) return `${row.name} reached ${amount} before today, in ${calendarYear(row, own)}.`
  return `${row.name} reaches ${amount} in ${yearsText(years)}, by ${calendarYear(row, own)}.`
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
  return headline(row, index, amount) + versus + reachedSentence(reachedOn)
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

export type YearsUnit = 'years' | 'calendar'

/**
 * What a cell says in its tinted box: the years from today, or the calendar year the path's own
 * yearly step falls in. Already there is a tick in both.
 */
export function cellText(row: MilestoneRow, index: number, unit: YearsUnit): string {
  const years = row.cells[index] ?? null
  const calendar = unit === 'calendar'
  if (years === 0) return '✓'
  if (years === null) return `${calendar ? calendarYear(row, row.horizonYears) : row.horizonFromNow}+`
  return calendar ? String(calendarYear(row, row.sinceStart[index] ?? 0)) : `${years}y`
}

export interface GapText {
  text: string
  sooner: boolean
}

/** The line under a cell while the table is comparing with the plan; null where there is nothing to say. */
export function gapLabel(row: MilestoneRow, plan: MilestoneRow | null, index: number): GapText | null {
  const gap = gapVersus(row, plan, index)
  // Both already there: the check marks say it, and "=" under each is only noise.
  if (gap === null || (gap.kind === 'same' && row.cells[index] === 0)) return null
  return { text: gapShort(gap), sooner: gapIsSooner(gap) }
}

/**
 * A row keeps the line under its cells only if one of them has something to put in it. Every
 * milestone counts, not only the page in view, so the rows do not change height with the page.
 */
export function rowHasGaps(row: MilestoneRow, plan: MilestoneRow | null): boolean {
  return row.cells.some((_, index) => gapLabel(row, plan, index) !== null)
}

/** The narrowest a milestone column is allowed to get on a phone, in px. */
const MIN_COLUMN_PX = 46
/** The share of the table's width the names take on a phone. */
const NAME_SHARE = 0.38

/**
 * How many milestone columns a table `width` px wide holds, with the names taking their share
 * and no column narrower than 46px. Never fewer than two: a page of one would read as a list.
 */
export function goalsPerPage(width: number): number {
  return Math.max(2, Math.floor((width * (1 - NAME_SHARE)) / MIN_COLUMN_PX))
}

/**
 * The milestone indices split into the fewest pages of at most `per` columns, as even as can
 * be, so no page is left with one lonely column. Everything on one page when it all fits.
 */
export function splitPages(indices: number[], per: number): number[][] {
  if (indices.length === 0) return []
  const pages = Math.ceil(indices.length / Math.max(1, per))
  const base = Math.floor(indices.length / pages)
  const longer = indices.length % pages
  let from = 0
  return Array.from({ length: pages }, (_, p) => {
    const size = base + (p < longer ? 1 : 0)
    const page = indices.slice(from, from + size)
    from += size
    return page
  })
}

/**
 * The milestones every row already has (a tick in each of its cells): a column of ticks says
 * the same thing a line of text does in less room. Empty when that would be all of them, so the
 * table never ends up with nothing to show.
 */
export function reachedByEveryRow(rows: MilestoneRow[], count: number): number[] {
  if (rows.length === 0) return []
  const all = Array.from({ length: count }, (_, i) => i)
  const done = all.filter((i) => rows.every((r) => r.cells[i] === 0))
  return done.length === count ? [] : done
}

/**
 * The rows in the order they get to one milestone: soonest first, those that never do last,
 * and rows that tie keep the order they have in the table.
 */
export function soonestFirst(rows: MilestoneRow[], index: number): MilestoneRow[] {
  const rank = (row: MilestoneRow) => row.cells[index] ?? Number.POSITIVE_INFINITY
  return rows
    .map((row, position) => ({ row, position }))
    .sort((a, b) => rank(a.row) - rank(b.row) || a.position - b.position)
    .map(({ row }) => row)
}

/** A page's heading, "150k–400k": its first and last milestone. */
export function pageLabel(first: string, last: string): string {
  return first === last ? first : `${first}–${last}`
}
