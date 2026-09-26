export interface Pt {
  x: number
  y: number
}

/** A sparse point at a fractional x-axis position (for check-in actual overlays). */
export interface ScatterPoint {
  /** Fractional year index — can be between integer indices. */
  xIndex: number
  value: number
  /** The reading's own date, for a tooltip that names it from a step it does not sit on. */
  label?: string
}

/** Value-space vertical band for a stacked area (lo <= hi). */
export interface Band {
  lo: number[]
  hi: number[]
}

/** Linear mapping from a numeric domain to a pixel range. */
export function makeScale(
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
): (value: number) => number {
  const span = domainMax - domainMin || 1
  return (value) => rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin)
}

function niceNum(range: number, round: boolean): number {
  const safe = range || 1
  const exp = Math.floor(Math.log10(Math.abs(safe)))
  const frac = Math.abs(safe) / 10 ** exp
  let nice: number
  if (round) nice = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10
  else nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10
  return nice * 10 ** exp
}

/** How far past the data the axis may run, as a share of the data's own range. */
const AXIS_MARGIN = 0.08

/** The next step up the 1-2-5 ladder: 1, 2, 5, 10, 20, 50... */
function coarser(step: number): number {
  const exp = Math.floor(Math.log10(step))
  const mantissa = Math.round(step / 10 ** exp)
  return (mantissa === 1 ? 2 : mantissa === 2 ? 5 : 10) * 10 ** exp
}

function axisAt(min: number, hi: number, step: number) {
  const span = hi - min
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(hi / step) * step
  const bottom = Math.max(niceMin, min - span * AXIS_MARGIN)
  const top = Math.min(niceMax, hi + span * AXIS_MARGIN)
  const slack = step * 1e-9
  const ticks = new Set<number>()
  for (let i = 0, v = niceMin; v <= top + slack; i++, v = niceMin + i * step) {
    if (v >= bottom - slack) ticks.add(Math.round(v))
  }
  return { min: bottom, max: top, ticks: [...ticks] }
}

/**
 * Readable ticks over a [min,max] range. The step comes from the range itself, and the axis
 * runs to the next gridline only when that is within a small margin of the data. Past it the
 * axis stops at the data plus the margin, so a value just over a gridline does not leave a
 * chart half empty above its lines. `maxTicks` is what the height can label: past it the step
 * goes up the ladder until the ticks fit, so a short chart is not left with labels on top of
 * each other.
 */
export function niceScale(
  min: number,
  max: number,
  count = 5,
  maxTicks = 7,
): { min: number; max: number; ticks: number[] } {
  const hi = min === max ? min + 1 : max
  let step = niceNum((hi - min) / Math.max(1, count - 1), true) || 1
  let scale = axisAt(min, hi, step)
  // Each rung at least doubles the step, so a few rungs always get down to two ticks.
  for (let rung = 0; rung < 24 && scale.ticks.length > Math.max(2, maxTicks); rung++) {
    step = coarser(step)
    scale = axisAt(min, hi, step)
  }
  return scale
}

/**
 * Domain across every series value and reference line. Zero is included unless the
 * caller opts out: a projection chart wants the axis anchored at nothing, but a
 * window onto one stretch of it wants the axis fitted to what is in view, or a year
 * of movement is a flat line under the ceiling.
 */
export function collectDomain(
  valueArrays: number[][],
  refValues: number[] = [],
  includeZero = true,
): {
  min: number
  max: number
} {
  // One non-finite value used to take the whole chart down, not just its own series:
  // it made the domain infinite, niceScale returned NaN bounds, and the scale built
  // from those mapped every point to NaN. An infinite FI target is reachable by
  // design, so the scale has to survive one.
  const all = [...(includeZero ? [0] : []), ...refValues, ...valueArrays.flat()].filter(
    Number.isFinite,
  )
  if (all.length === 0) return { min: 0, max: 0 }
  return { min: Math.min(...all), max: Math.max(...all) }
}

/** Stack area series: positives accumulate above zero, negatives below (Recharts-style). */
export function stackAreas(series: number[][]): Band[] {
  const n = series[0]?.length ?? 0
  const posBase = new Array<number>(n).fill(0)
  const negBase = new Array<number>(n).fill(0)
  return series.map((values) => {
    const lo: number[] = []
    const hi: number[] = []
    for (let i = 0; i < n; i++) {
      const v = values[i] ?? 0
      if (v >= 0) {
        lo[i] = posBase[i] ?? 0
        hi[i] = (posBase[i] ?? 0) + v
        posBase[i] = hi[i] ?? 0
      } else {
        hi[i] = negBase[i] ?? 0
        lo[i] = (negBase[i] ?? 0) + v
        negBase[i] = lo[i] ?? 0
      }
    }
    return { lo, hi }
  })
}

/** Keep every `step`-th label (plus the last); blank the rest to avoid crowding. */
export function sparseLabels(values: Array<string | number>, step: number): string[] {
  return values.map((v, i) => (i % step === 0 || i === values.length - 1 ? String(v) : ''))
}

export function linePath(points: Pt[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
}

/** Closed fill between an upper edge and a (reversed) lower edge. */
export function areaPath(top: Pt[], bottom: Pt[]): string {
  if (top.length === 0) return ''
  const up = top.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const down = [...bottom]
    .reverse()
    .map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')
  return `${up} ${down} Z`
}
