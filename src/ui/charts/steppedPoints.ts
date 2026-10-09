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
