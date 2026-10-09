/**
 * When the plan's line reaches an amount on the account. A milestone is a fixed number of euros you
 * want to see on the account on some day, so it is compared with the plan in euros on that day, which
 * is the line (in the euros of the plan start) grown by the inflation since: `V(t) × (1 + i)^t`.
 * Compared with the line itself, a 500.000 € milestone was reached years later than the account
 * would show it, because the line is worth less than the euros on the account.
 *
 * Inside a year the line is straight, so on a segment the screen value `f(u) = (a + (b - a)u) g^(k-1+u)`
 * (g = 1 + i, u the share of the year) is either rising or rises to one peak and then falls (a line
 * that falls faster than inflation lifts it): there is at most one crossing going up to find on the
 * rising part, by bisection, and no need for anything cleverer. A step on an anniversary can jump
 * over the amount, which is then reached on the anniversary.
 */
import { planValueAt, type PlanLine, type PlanSegment } from './planLine'

export interface MilestoneCrossing {
  /** Years from the plan start at which the line first reaches the amount, in euros on the account. */
  offset: number
  /** Whether it stays at or above the amount for the rest of the plan. */
  staysAbove: boolean
  /** When it first falls back below, in years from the start; null when it does not. */
  dipsAt: number | null
}

const BISECTIONS = 48

interface Curve {
  segment: PlanSegment
  /** g^(k-1): the growth of the euros on the account up to the start of the segment. */
  base: number
  g: number
  kappa: number
}

function curveOf(segment: PlanSegment, g: number): Curve {
  return { segment, base: Math.pow(g, segment.from), g, kappa: Math.log(g) }
}

/** The line in euros on the account, `u` of the way through the segment. */
function screen(c: Curve, u: number): number {
  const { start, end } = c.segment
  return (start + (end - start) * u) * c.base * Math.pow(c.g, u)
}

/**
 * Where the screen value stops rising and starts to fall inside the segment, or null when it does
 * not: only a line that falls, by less than the inflation lifts it by at the start, has a peak.
 */
function peakOf(c: Curve): number | null {
  const { start, end } = c.segment
  const drop = end - start
  if (drop >= 0 || c.kappa === 0) return null
  const x = drop + c.kappa * start
  if (x <= 0) return null
  const u = x / (c.kappa * -drop)
  return u < 1 ? u : null
}

/** Whether the screen value only falls along the whole segment. */
function onlyFalls(c: Curve): boolean {
  const { start, end } = c.segment
  return end < start && (c.kappa === 0 || end - start + c.kappa * start <= 0)
}

/** The smallest `u` in [lo, hi] with `f(u) >= amount`, where f rises on all of it and reaches it at hi. */
function bisectUp(c: Curve, amount: number, lo: number, hi: number): number {
  let low = lo
  let high = hi
  for (let i = 0; i < BISECTIONS; i++) {
    const mid = (low + high) / 2
    if (screen(c, mid) >= amount) high = mid
    else low = mid
  }
  return high
}

/** The smallest `u` in [lo, hi] with `f(u) < amount`, where f falls on all of it and is under at hi. */
function bisectDown(c: Curve, amount: number, lo: number, hi: number): number {
  let low = lo
  let high = hi
  for (let i = 0; i < BISECTIONS; i++) {
    const mid = (low + high) / 2
    if (screen(c, mid) < amount) high = mid
    else low = mid
  }
  return high
}

/** The first time inside the segment, from `from` on, that the screen value is at the amount going up. */
function riseWithin(c: Curve, amount: number, from: number): number | null {
  if (onlyFalls(c)) return null
  const peak = peakOf(c)
  const top = peak ?? 1
  if (top <= from || screen(c, top) < amount) return null
  return bisectUp(c, amount, from, top)
}

/** The first time inside the segment, from `from` on (where it is at the amount or above), that it is below. */
function fallWithin(c: Curve, amount: number, from: number): number | null {
  const peak = peakOf(c)
  const start = peak === null ? from : Math.max(from, peak)
  const falls = peak !== null || onlyFalls(c)
  if (!falls || screen(c, 1) >= amount) return null
  return bisectDown(c, amount, start, 1)
}

/** The screen value just after the anniversary a segment ends on, once its step has happened. */
function afterStep(segment: PlanSegment, g: number): number {
  return segment.after * Math.pow(g, segment.to)
}

function firstRise(line: PlanLine, amount: number, g: number): { index: number; offset: number } | null {
  for (let i = 0; i < line.segments.length; i++) {
    const c = curveOf(line.segments[i]!, g)
    const u = riseWithin(c, amount, 0)
    if (u !== null) return { index: i, offset: c.segment.from + u }
    // A step up can take the line over the amount on the anniversary itself.
    if (afterStep(c.segment, g) >= amount) return { index: i, offset: c.segment.to }
  }
  return null
}

/** Where, after a crossing in segment `index` at `offset`, the screen value first falls below the amount. */
function firstDip(line: PlanLine, amount: number, g: number, index: number, offset: number): number | null {
  const first = curveOf(line.segments[index]!, g)
  const inside = offset >= first.segment.to ? null : fallWithin(first, amount, offset - first.segment.from)
  if (inside !== null) return first.segment.from + inside
  // The step on the anniversary the crossing segment ends on, then each segment after it.
  for (let i = index; i < line.segments.length; i++) {
    const c = curveOf(line.segments[i]!, g)
    if (i > index) {
      const start = c.segment.start * c.base
      if (start < amount) return c.segment.from
      const within = fallWithin(c, amount, 0)
      if (within !== null) return c.segment.from + within
    }
    if (afterStep(c.segment, g) < amount) return c.segment.to
  }
  return null
}

/**
 * The first day the plan's line, in euros on the account, reaches `amountCents`, and whether it stays
 * there. Null when it never does within the plan.
 */
export function milestoneCrossing(line: PlanLine, amountCents: number, inflationRate: number): MilestoneCrossing | null {
  const g = 1 + inflationRate
  const first = planValueAt(line, 0)
  if (first === null) return null
  if (first >= amountCents) return { offset: 0, ...stays(line, amountCents, g, null) }
  const found = firstRise(line, amountCents, g)
  if (found === null) return null
  return { offset: found.offset, ...stays(line, amountCents, g, found) }
}

function stays(
  line: PlanLine,
  amount: number,
  g: number,
  found: { index: number; offset: number } | null,
): { staysAbove: boolean; dipsAt: number | null } {
  if (line.segments.length === 0) return { staysAbove: true, dipsAt: null }
  const dips = firstDip(line, amount, g, found?.index ?? 0, found?.offset ?? 0)
  return { staysAbove: dips === null, dipsAt: dips }
}
