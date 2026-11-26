import { calendarYear, type MilestoneRow } from './milestoneModel'

export type CellMove = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'

export const CELL_MOVES: readonly string[] = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']

/** Where an arrow key, Home or End takes the focus from a cell; it stops at the edges. */
export function moveCell(
  at: { row: number; col: number },
  key: CellMove,
  size: { rows: number; cols: number },
): { row: number; col: number } {
  const clamp = (
    n: number,
    max: number,
  ) => Math.max(0, Math.min(max - 1, n))
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

/** The cell the reader is on: set by pointing, focus or a tap, and kept for the readout. */
export interface CellRef {
  rowId: string
  index: number
}

/** The sentence for the cell the reader is on, or null before they have been on one. */
export function sentenceAt(
  point: CellRef | null,
  rows: MilestoneRow[],
  sentences: string[][],
): string | null {
  if (!point) return null
  const row = rows.findIndex((r) => r.id === point.rowId)
  return sentences[row]?.[point.index] ?? null
}

/**
 * What a cell says in its tinted box: the years from today, or the calendar year the path's own
 * yearly step falls in. Already there is a tick in both.
 */
export function cellText(
  row: MilestoneRow,
  index: number,
  unit: YearsUnit,
): string {
  const years = row.cells[index] ?? null
  const calendar = unit === 'calendar'
  if (years === 0) return '✓'
  if (years === null) return `${calendar ? calendarYear(row, row.horizonYears) : row.horizonFromNow}+`
  return calendar ? String(calendarYear(row, row.sinceStart[index] ?? 0)) : `${years}y`
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
export function splitPages(
  indices: number[],
  per: number,
): number[][] {
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
export function reachedByEveryRow(
  rows: MilestoneRow[],
  count: number,
): number[] {
  if (rows.length === 0) return []
  const all = Array.from({ length: count }, (_, i) => i)
  const done = all.filter((i) => rows.every((r) => r.cells[i] === 0))
  return done.length === count ? [] : done
}

/**
 * The rows in the order they get to one milestone: soonest first, those that never do last,
 * and rows that tie keep the order they have in the table.
 */
export function soonestFirst(
  rows: MilestoneRow[],
  index: number,
): MilestoneRow[] {
  const rank = (row: MilestoneRow) => row.cells[index] ?? Number.POSITIVE_INFINITY
  return rows
    .map((row, position) => ({ row, position }))
    .sort((a, b) => rank(a.row) - rank(b.row) || a.position - b.position)
    .map(({ row }) => row)
}

/** A page's heading, "150k–400k": its first and last milestone. */
export function pageLabel(
  first: string,
  last: string,
): string {
  return first === last ? first : `${first}–${last}`
}
