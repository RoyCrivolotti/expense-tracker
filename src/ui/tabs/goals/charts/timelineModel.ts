import type { Milestone } from '../../../../types'
import { calendarYear, yearsText, type MilestoneRow } from './milestoneModel'

/**
 * The sizes the stylesheet gives the timeline, in pixels. The connector line is drawn from them,
 * so they have to agree with `--tl-row`, `--tl-dot` and `--tl-gutter` in goals.module.css.
 */
export const ROW_HEIGHT = 54
export const DOT_Y = 27.5
/** The room either side of the axis, for the badges. */
export const GUTTER = 46

/** Milestones of one path that fall in the same year, drawn as one dot. */
export interface DotCluster {
  /** Whole years from the start of the shared axis. */
  at: number
  /** Whole years from the path's own start, as the table reads them. */
  years: number
  /** Indexes into the milestone list, smallest amount first. */
  indices: number[]
}

export interface RowLayout {
  /** Already there: met at the path's start, or reached by a check-in. Drawn as one badge at the left edge. */
  gutter: number[]
  /** Not within the path's horizon. Drawn as one badge past the end of the path. */
  beyond: number[]
  clusters: DotCluster[]
}

/** The calendar year the shared axis starts in: the plan's start, or the first path's when none is the plan. */
export function axisStartYear(rows: MilestoneRow[]): number {
  const base = rows.find((r) => r.kind === 'plan') ?? rows[0]
  return base ? calendarYear(base, 0) : new Date().getFullYear()
}

/** How far into the axis a path starts: a path that starts later (the plan from today) is shifted by the years between. */
export function rowOffset(row: MilestoneRow, startYear: number): number {
  return Math.max(0, calendarYear(row, 0) - startYear)
}

/** The length of the axis: the furthest any path's horizon reaches. */
export function axisSpan(rows: MilestoneRow[], startYear: number): number {
  return Math.max(1, ...rows.map((r) => rowOffset(r, startYear) + r.horizonYears))
}

/**
 * Where a path's milestones go. When every milestone has been reached by a check-in the
 * check-ins say nothing that tells them apart, so only the ones met at the path's start are
 * collapsed and the rest are placed where the path reaches them.
 */
export function layoutRow(row: MilestoneRow, milestones: Milestone[], reached: Map<number, string>, startYear: number): RowLayout {
  const offset = rowOffset(row, startYear)
  const allReached = milestones.every((m) => reached.has(m.amountCents))
  const gutter: number[] = []
  const beyond: number[] = []
  const byYear = new Map<number, number[]>()
  milestones.forEach((m, i) => {
    const years = row.cells[i] ?? null
    if (years === 0 || (!allReached && reached.has(m.amountCents))) gutter.push(i)
    else if (years === null) beyond.push(i)
    else byYear.set(years, [...(byYear.get(years) ?? []), i])
  })
  const clusters = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([years, indices]) => ({ at: offset + years, years, indices }))
  return { gutter, beyond, clusters }
}

/** Axis ticks every `step` years, with the end of the axis added when it is not close to the last. */
export function axisTicks(span: number, step = 5): number[] {
  const ticks: number[] = []
  for (let t = 0; t <= span; t += step) ticks.push(t)
  const last = ticks[ticks.length - 1] ?? 0
  if (last !== span && span - last >= step * 0.6) ticks.push(span)
  return ticks
}

const CHAR_PX = 6
const LABEL_PAD = 8

/** The width a label is given, which is a guess from its length: the text is not measured. */
export function labelWidth(text: string): number {
  return text.length * CHAR_PX + LABEL_PAD
}

export type LabelLevel = 'up' | 'dn' | null

/**
 * Which of the labels fit, on two levels above and below the line. A label goes on the upper
 * level if its left edge clears the right edge of the one before it there, else on the lower
 * level, else it is left off (its dot still says it when pointed at). The followed milestone's
 * label is always shown, above. `track` is the width in pixels the axis takes, so a wider
 * screen fits more of them.
 */
export function placeLabels(
  items: { at: number; text: string; pick: boolean }[],
  span: number,
  track: number,
): LabelLevel[] {
  let upEnd = -Infinity
  let downEnd = -Infinity
  return items.map(({ at, text, pick }) => {
    const x = (at / span) * track
    const half = labelWidth(text) / 2
    if (pick || x - half >= upEnd) {
      upEnd = x + half
      return 'up'
    }
    if (x - half >= downEnd) {
      downEnd = x + half
      return 'dn'
    }
    return null
  })
}

/** The amounts of a run of milestones for a dot's label: "300k" for one, "300\u2013500k" for several. */
export function rangeLabel(amounts: string[]): string {
  const first = amounts[0] ?? ''
  const last = amounts[amounts.length - 1] ?? ''
  if (amounts.length <= 1) return first
  return first.slice(-1) === last.slice(-1) ? `${first.slice(0, -1)}\u2013${last}` : `${first}\u2013${last}`
}

function listOf(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** What a dot says when it stands for several milestones that fall in the same year. */
export function describeCluster(row: MilestoneRow, years: number, amounts: string[]): string {
  return `${row.name} reaches ${listOf(amounts)} in ${yearsText(years)}, by ${calendarYear(row, years)}.`
}

/** What the badge at the left edge stands for. `how` says for each milestone why it is already there. */
export function describeGutter(row: MilestoneRow, amounts: string[], how: string[]): string {
  return `${row.name} already has ${listOf(amounts.map((a, i) => `${a} (${how[i] ?? ''})`))}.`
}

/** What the badge past the end of a path stands for. */
export function describeBeyond(row: MilestoneRow, amounts: string[]): string {
  return `${row.name} does not reach ${listOf(amounts)} within its ${row.horizonYears} year horizon.`
}
