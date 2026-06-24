export interface Pt {
  x: number
  y: number
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

/** Round a [min,max] range outward to readable tick boundaries. */
export function niceScale(
  min: number,
  max: number,
  count = 5,
): { min: number; max: number; ticks: number[] } {
  const hi = min === max ? min + 1 : max
  const range = niceNum(hi - min, false)
  const step = niceNum(range / Math.max(1, count - 1), true) || 1
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let v = niceMin; v <= niceMax + step / 2; v += step) ticks.push(Math.round(v))
  return { min: niceMin, max: niceMax, ticks }
}

/** Domain across every series value and reference line, always including zero. */
export function collectDomain(valueArrays: number[][], refValues: number[] = []): {
  min: number
  max: number
} {
  const all = [0, ...refValues, ...valueArrays.flat()]
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
