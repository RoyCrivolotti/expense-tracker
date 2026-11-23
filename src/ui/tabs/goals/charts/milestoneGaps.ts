import { shortMonthYearLabel } from '../../../../engine'
import { calendarYear, type MilestoneRow } from './milestoneModel'
import { atStartText, beyondText, yearsText } from './milestoneText'

export type Gap =
  { kind: 'same' } | { kind: 'years'; years: number } | { kind: 'later' } | { kind: 'sooner' } | { kind: 'neither' }

/**
 * How one path stands against the plan for one milestone, or null for the plan itself and when
 * there is no plan. Both sides are the years from today that the table shows, so whatever day a
 * path started on the figure is the difference between the two cells on screen.
 */
export function gapVersus(
  row: MilestoneRow,
  plan: MilestoneRow | null,
  index: number,
): Gap | null {
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

function gapSentence(
  gap: Gap,
  planName: string,
): string {
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

function headline(
  row: MilestoneRow,
  index: number,
  amount: string,
): string {
  const years = row.cells[index] ?? null
  if (years === null) return beyondText(row, amount)
  const own = row.sinceStart[index] ?? 0
  if (own === 0) return atStartText(row, amount)
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

export interface GapText {
  text: string
  sooner: boolean
}

/** The line under a cell while the table is comparing with the plan; null where there is nothing to say. */
export function gapLabel(
  row: MilestoneRow,
  plan: MilestoneRow | null,
  index: number,
): GapText | null {
  const gap = gapVersus(row, plan, index)
  // Both already there: the check marks say it, and "=" under each is only noise.
  if (gap === null || (gap.kind === 'same' && row.cells[index] === 0)) return null
  return { text: gapShort(gap), sooner: gapIsSooner(gap) }
}

/**
 * A row keeps the line under its cells only if one of them has something to put in it. Every
 * milestone counts, not only the page in view, so the rows do not change height with the page.
 */
export function rowHasGaps(
  row: MilestoneRow,
  plan: MilestoneRow | null,
): boolean {
  return row.cells.some((_, index) => gapLabel(row, plan, index) !== null)
}
