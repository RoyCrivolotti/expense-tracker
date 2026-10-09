/**
 * Reading a balance against the line near a step. A house payment or event is on the plan's
 * anniversary to the day, but real ones are a week early or a fortnight late, and a check-in then is
 * not wrong, just on the other side of a step that is bigger than a month. A balance within a month of
 * the anniversary is read against whichever path it is on: the plan with the step made, or without it.
 * Away from a step it is the line itself, and "on track" is a month of the line's own rise either way.
 */
import { isBoundary, planValueAt, type PlanLine, type PlanSegment } from './planLine'

/** A month, in years: how near an anniversary a balance is read against either side of its step. */
export const STEP_WINDOW = 1 / 12

/** How many months of the line's rise a balance may be from the other path of a step and still be read against it. */
const OTHER_PATH_MONTHS = 3

/** At least this many cents of room, so rounding to cents cannot tip a balance on a flat line off it. */
const MIN_BAND = 100

/** The segment of the line a date is in: the year it is in, or the last year at the last day. */
function segmentAt(line: PlanLine, offset: number): PlanSegment | undefined {
  return line.segments[Math.min(Math.floor(offset), line.segments.length - 1)]
}

/** Half of the width of "on track": a month of what the line rises by in the year the date is in. */
export function monthBand(line: PlanLine, offset: number): number {
  const segment = segmentAt(line, offset)
  return segment ? Math.max(MIN_BAND, Math.abs(segment.end - segment.start) / 12) : MIN_BAND
}

export interface NearStep {
  /** The anniversary with the step. */
  anniversary: number
  /** The line on the other side of the step, carried through this date. */
  alternate: number
  /** Whether that other path has the step `made` (the date is before it) or `not-made` (after). */
  counted: 'made' | 'not-made'
}

/** The rise per year of the segment `index`, or of the nearest one that exists. */
function riseOf(line: PlanLine, index: number): number {
  const segment = line.segments[Math.max(0, Math.min(index, line.segments.length - 1))]
  return segment ? segment.end - segment.start : 0
}

/**
 * The other path, when the date is within a month of an anniversary whose step ends a stretch:
 * before it, the line from after the step carried back; after it, the line from before the step
 * carried on. Null anywhere else.
 */
export function nearStep(line: PlanLine, offset: number): NearStep | null {
  const anniversary = Math.round(offset)
  const segment = line.segments[anniversary - 1]
  if (!segment || Math.abs(offset - anniversary) > STEP_WINDOW || !isBoundary(segment)) return null
  const days = offset - anniversary
  return days < 0
    ? { anniversary, alternate: Math.round(segment.after + days * riseOf(line, anniversary)), counted: 'made' }
    : { anniversary, alternate: Math.round(segment.end + days * riseOf(line, anniversary - 1)), counted: 'not-made' }
}

export interface Reading {
  /** What the balance is set against: the line on the day, or the other path of a step within a month. */
  reference: number
  onTrack: boolean
  /** Set when the other path is the one used, with the anniversary and which side of the step it has. */
  nearStep: { anniversary: number; counted: 'made' | 'not-made' } | null
}

/** The balance against the line on `offset`; null where there is no line. */
export function readAgainst(line: PlanLine, offset: number, balanceCents: number): Reading | null {
  const main = planValueAt(line, offset)
  if (main === null) return null
  const near = nearStep(line, offset)
  const gap = near === null ? Infinity : Math.abs(balanceCents - near.alternate)
  const other = near !== null && gap < Math.abs(balanceCents - main) && gap <= OTHER_PATH_MONTHS * monthBand(line, offset)
  const reference = other ? near.alternate : main
  return {
    reference,
    onTrack: Math.abs(balanceCents - reference) <= monthBand(line, offset),
    nearStep: other ? { anniversary: near.anniversary, counted: near.counted } : null,
  }
}
