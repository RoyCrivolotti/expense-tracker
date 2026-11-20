import type { Pt } from './linearScale'

/**
 * The points of a line that steps on some years. `values` is what each year ends at; `before` is
 * what it reached the day before, where that differs because a payment or event lands on the
 * anniversary. The line climbs to the earlier value and drops (or rises) straight to the later one,
 * where a chord from one year-end to the next would slope across the whole year.
 */
export function steppedPoints(
  values: number[],
  before: number[] | undefined,
  x: (i: number) => number,
  y: (v: number) => number,
): Pt[] {
  const points: Pt[] = []
  values.forEach((value, i) => {
    const reached = before?.[i]
    if (reached !== undefined && reached !== value) points.push({ x: x(i), y: y(reached) })
    points.push({ x: x(i), y: y(value) })
  })
  return points
}

/** Every value a line is drawn through: its places, and what it reached before a step where it has one. */
export function drawnValuesOf(series: { values: number[]; preStep?: number[] | undefined }): number[] {
  return series.preStep ? [...series.values, ...series.preStep] : series.values
}

/** A line or band laid out on the axis: its values, the step before each, and where each sits when not on place i. */
interface Placed {
  values: number[]
  preStep?: number[] | undefined
  xs?: number[] | undefined
}

/** How close to a place a value's x has to be to count as on it: `xs` are worked out in fractional years. */
const ON_PLACE = 1e-9

/** The x of each value in the chart's pixels: place i for a series on the axis' places, its own x where it has one. */
export function placeX(series: { xs?: number[] | undefined }, xForIndex: (i: number) => number): (i: number) => number {
  const xs = series.xs
  return xs ? (i) => xForIndex(xs[i] ?? i) : xForIndex
}

/** How many of the axis' places a series reaches: one per value, or up to the place at or past its last x. */
export function placesOf(series: { values: number[]; xs?: number[] | undefined }): number {
  const last = series.xs?.[series.xs.length - 1]
  return last === undefined ? series.values.length : Math.ceil(last - ON_PLACE) + 1
}

/**
 * A series' value at a place of the axis, as drawn: on a place it has a value for, that value (the one
 * after a step); between two of its own, on the straight line from the first to what the second reached
 * before its step. Nothing before its first value or after its last. A series on the axis' places is
 * read at the place itself, as it always has been.
 */
export function valueAtPlace(series: Placed, place: number): number | undefined {
  const { values, preStep, xs } = series
  if (!xs) return values[place]
  const last = xs.length - 1
  if (last < 0 || place < xs[0]! - ON_PLACE || place > xs[last]! + ON_PLACE) return undefined
  let i = 0
  while (i < last && xs[i + 1]! <= place + ON_PLACE) i++
  if (Math.abs(xs[i]! - place) <= ON_PLACE || i === last) return values[i]
  const to = preStep?.[i + 1] ?? values[i + 1]!
  return values[i]! + ((place - xs[i]!) / (xs[i + 1]! - xs[i]!)) * (to - values[i]!)
}
