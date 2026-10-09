/**
 * How far a balance sits from the plan, as a stretch of time: the months between the date asked
 * about and the point on the plan's line that has this balance. It is the horizontal gap on the
 * chart, so it follows the plan's own pace, return included, and does not jump where the plan
 * changes how much it invests. A gap in money divided by the monthly amount does both.
 *
 * The line rises through each year and steps on the anniversary of a house payment or a life event
 * (`planLine`). Months are only measured along the stretch the date is in, between two steps: a
 * balance the line only has on the far side of a purchase is not "three years ahead", the line was
 * simply somewhere else then, so there the gap in money is all there is to say.
 *
 * Inside a stretch the line is not always rising, so the point is the nearest one in the direction
 * of the gap: ahead looks for the first time the line gets to the balance, behind for the last time
 * it was at it.
 */
import { planLineOf, stretchAround, type PlanLine, type PlanPoint, type PlanSegment } from './planLine'

export interface PlanDistance {
  /** Positive when the balance is ahead of the plan, negative when behind. */
  months: number
  /** Where on the plan's axis, in years from its start, the line has the balance. */
  atOffset: number
}

/**
 * What measuring found: the months along the stretch, or why there are none. `across-event` means
 * the line has the balance, but only on the other side of a purchase or event; `outside-line` that
 * it never has it (or there is no line on that day).
 */
export type PlanMeasure =
  | ({ kind: 'along' } & PlanDistance)
  | { kind: 'unmeasured'; reason: 'across-event' | 'outside-line' }

const OUTSIDE: PlanMeasure = { kind: 'unmeasured', reason: 'outside-line' }
const ACROSS: PlanMeasure = { kind: 'unmeasured', reason: 'across-event' }

/** The line on a segment at `t`, unrounded: the search solves for a time, and cents would nudge it. */
function onSegment(s: PlanSegment, t: number): number {
  return s.start + (t - s.from) * (s.end - s.start)
}

function along(offset: number, t: number): PlanMeasure {
  return { kind: 'along', months: (t - offset) * 12, atOffset: t }
}

/** The first time at or after `offset`, inside the stretch, that the line gets up to `balance`. */
function firstReaching(line: PlanLine, offset: number, to: number, balance: number): number | null {
  for (let i = Math.floor(offset); i < to; i++) {
    const segment = line.segments[i]
    if (!segment || segment.end < balance) continue
    const from = Math.max(segment.from, offset)
    const start = onSegment(segment, from)
    return from + ((balance - start) / (segment.end - start)) * (segment.to - from)
  }
  return null
}

/** The last time at or before `offset`, inside the stretch, that the line was down at `balance`. */
function lastAt(line: PlanLine, offset: number, from: number, balance: number): number | null {
  for (let i = Math.floor(offset); i >= from; i--) {
    const segment = line.segments[i]
    if (!segment || segment.start > balance) continue
    const to = Math.min(segment.to, offset)
    const end = onSegment(segment, to)
    return segment.from + ((balance - segment.start) / (end - segment.start)) * (to - segment.from)
  }
  return null
}

/** Whether any part of the line outside the stretch has the balance, which is what makes a step the reason. */
function elsewhere(line: PlanLine, from: number, to: number, ahead: boolean, balance: number): boolean {
  const reach = (s: PlanSegment) => (ahead ? Math.max(s.start, s.end) >= balance : Math.min(s.start, s.end) <= balance)
  return ahead ? line.segments.slice(to).some(reach) : line.segments.slice(0, from).some(reach)
}

/** The months between `offset` and the point of the line that has `balanceCents`, or why there are none. */
export function measurePlanDistance(line: PlanLine, offset: number, balanceCents: number): PlanMeasure {
  if (line.segments.length < 1 || !(offset >= 0) || offset >= line.horizon) return OUTSIDE
  const stretch = stretchAround(line, offset)
  const segment = line.segments[Math.floor(offset)]
  if (!segment) return OUTSIDE
  const here = onSegment(segment, offset)
  if (balanceCents === Math.round(here)) return along(offset, offset)

  const ahead = balanceCents > here
  const found = ahead
    ? firstReaching(line, offset, stretch.to, balanceCents)
    : lastAt(line, offset, stretch.from, balanceCents)
  if (found !== null) return along(offset, found)
  return elsewhere(line, stretch.from, stretch.to, ahead, balanceCents) ? ACROSS : OUTSIDE
}

/**
 * Null when the months are not measured: before the plan starts or past its last year there is no
 * line to measure against, a balance the line never has is further away than the plan can say, and
 * one it only has across a step is not counted in months. Takes the line, or the points it is made of.
 */
export function planDistance(
  line: PlanLine | readonly PlanPoint[],
  offset: number,
  balanceCents: number,
): PlanDistance | null {
  const result = measurePlanDistance('segments' in line ? line : planLineOf(line), offset, balanceCents)
  return result.kind === 'along' ? { months: result.months, atOffset: result.atOffset } : null
}
