/**
 * The plan's line: what the invested portfolio is on any day of the plan. It rises through each
 * year from where the last anniversary left it to what the year's return and contributions make of
 * it, and on the anniversary a house payment or a life event steps it up or down. A chord from one
 * year-end value to the next put the step across the whole year before it, which read as ahead or
 * behind to someone exactly on plan.
 */

export interface PlanPoint {
  year: number
  /** The year-end value, after a house payment and life events. */
  investedCents: number
  /** The value on the day before them; the same as `investedCents` when the year has none. */
  preEventInvestedCents?: number
}

/** One year of the line: it runs from `start` at `from` to `end` at `to`, where it steps to `after`. */
export interface PlanSegment {
  from: number
  to: number
  start: number
  end: number
  after: number
}

export interface PlanLine {
  segments: readonly PlanSegment[]
  /** The value on the day the plan starts. */
  first: number
  /** The last year of the plan, in years from its start. */
  horizon: number
}

/** A line with nothing in it, for points that are not a plan: every day is outside it. */
const NO_LINE: PlanLine = { segments: [], first: 0, horizon: -1 }

/** Points from year 0 on with no year missing, which is what a projection is; anything else is no line. */
export function planLineOf(points: readonly PlanPoint[]): PlanLine {
  const ordered = [...points].sort((a, b) => a.year - b.year)
  if (!ordered.every((p, i) => p.year === i)) return NO_LINE
  const first = ordered[0]?.investedCents ?? 0
  const segments: PlanSegment[] = []
  for (let i = 1; i < ordered.length; i++) {
    const prior = ordered[i - 1]!
    const point = ordered[i]!
    segments.push({
      from: prior.year,
      to: point.year,
      start: prior.investedCents,
      end: point.preEventInvestedCents ?? point.investedCents,
      after: point.investedCents,
    })
  }
  return { segments, first, horizon: ordered.length - 1 }
}

/**
 * The plan's value `years` after its start, in cents. On an anniversary it is the value after that
 * year's payment or event. Null before the start, after the last year, or for a date that is not one.
 */
export function planValueAt(line: PlanLine, years: number): number | null {
  if (!(years >= 0) || years > line.horizon) return null
  const whole = Math.floor(years)
  if (years === whole) return whole === 0 ? line.first : (line.segments[whole - 1]?.after ?? line.first)
  const segment = line.segments[whole]
  if (!segment) return null
  return Math.round(segment.start + (years - segment.from) * (segment.end - segment.start))
}

/** How many months of the year's own rise a step has to be before it ends a stretch. */
const BOUNDARY_MONTHS = 3

/**
 * Whether the step on the end of a segment ends a stretch. Counting months across a step is off by
 * the size of the step in months of the line's rise, so a bonus or a gift of a month or two of it can
 * be counted across and a house payment cannot. The chart draws every step, whatever its size.
 */
export function isBoundary(segment: PlanSegment): boolean {
  const step = Math.abs(segment.after - segment.end)
  return step >= Math.max(1, (BOUNDARY_MONTHS * Math.abs(segment.end - segment.start)) / 12)
}

function stepsAt(line: PlanLine, anniversary: number): boolean {
  const segment = line.segments[anniversary - 1]
  return segment !== undefined && isBoundary(segment)
}

/**
 * The stretch of the line without a step that ends it that has `years` in it: from the anniversary
 * where it begins (that day's value is already after the step) to the next anniversary with one, or
 * the last year. Months along the line are only measured inside one.
 */
export function stretchAround(line: PlanLine, years: number): { from: number; to: number } {
  let from = Math.floor(years)
  while (from > 0 && !stepsAt(line, from)) from -= 1
  let to = Math.floor(years) + 1
  while (to < line.horizon && !stepsAt(line, to)) to += 1
  return { from, to: Math.min(to, line.horizon) }
}

/**
 * What a chart draws for a projection: the year-end values, and the values before a step where any
 * year has one. A plan with no payment or event has no steps to draw.
 */
export function lineValues(points: readonly PlanPoint[]): { values: number[]; preStep?: number[] } {
  const values = points.map((p) => p.investedCents)
  const before = points.map((p) => p.preEventInvestedCents ?? p.investedCents)
  return before.some((v, i) => v !== values[i]) ? { values, preStep: before } : { values }
}

/**
 * The value on the day before `years`: on an anniversary with a step, what the year reached before
 * the payment or event landed; on any other day the same as `planValueAt`.
 */
export function planValueBefore(line: PlanLine, years: number): number | null {
  const whole = Math.floor(years)
  if (years === whole && whole >= 1 && whole <= line.horizon) return line.segments[whole - 1]?.end ?? null
  return planValueAt(line, years)
}
