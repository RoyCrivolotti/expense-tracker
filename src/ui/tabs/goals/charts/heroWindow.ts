import type { ChartSeries } from '../../../charts/LinearChart'

/**
 * How many years of the projection the hero chart shows. Thirty years of compounding
 * flatten the first decade into a line along the axis; a shorter window is where the
 * check-ins and the next few milestones are legible.
 */
export type HeroWindowKey = '5y' | '10y' | '20y' | 'all'

export const HERO_WINDOWS: { value: HeroWindowKey; label: string; years: number | null }[] = [
  { value: '5y', label: '5Y', years: 5 },
  { value: '10y', label: '10Y', years: 10 },
  { value: '20y', label: '20Y', years: 20 },
  { value: 'all', label: 'All', years: null },
]

/** The windows worth offering for a horizon: only those shorter than it, plus All. */
export function heroWindowsFor(horizonYears: number): typeof HERO_WINDOWS {
  return HERO_WINDOWS.filter((w) => w.years === null || w.years < horizonYears)
}

/** Everything the chart draws, cut at `windowYears` (null keeps the whole horizon). */
export function clipToWindow(
  years: number[],
  series: ChartSeries[],
  windowYears: number | null,
): { years: number[]; series: ChartSeries[] } {
  if (windowYears === null) return { years, series }
  const keep = years.filter((y) => y <= windowYears).length
  return {
    years: years.slice(0, keep),
    series: series.map((s) =>
      s.xs
        ? clipPlaced(s, s.xs, windowYears)
        : {
            ...s,
            values: s.values.slice(0, keep),
            ...(s.preStep ? { preStep: s.preStep.slice(0, keep) } : {}),
            ...(s.band ? { band: clipBand(s.band, keep) } : {}),
            ...(s.points ? { points: s.points.filter((p) => p.xIndex <= windowYears) } : {}),
          },
    ),
  }
}

/**
 * One edge of a series cut to `keep` values, and what each reached before its step. Where the cut falls
 * between two of its values it gains one more at `edge`, on the line from the last kept towards what
 * the next reached before its step; nothing steps there.
 */
function cutAt(
  values: number[],
  pre: number[] | undefined,
  xs: number[],
  keep: number,
  edge: number,
): { values: number[]; pre?: number[] } {
  const kept = { values: values.slice(0, keep), ...(pre ? { pre: pre.slice(0, keep) } : {}) }
  const from = values[keep - 1]
  const next = values[keep]
  if (from === undefined || next === undefined || xs[keep - 1]! >= edge) return kept
  const to = pre?.[keep] ?? next
  const carried = from + ((edge - xs[keep - 1]!) / (xs[keep]! - xs[keep - 1]!)) * (to - from)
  return { values: [...kept.values, carried], ...(kept.pre ? { pre: [...kept.pre, carried] } : {}) }
}

/**
 * A series that sits between the axis' places (a scenario that starts part-way along it), cut at the
 * window. Its anniversaries rarely fall on the window's edge, so it is carried to the edge along the
 * year it is cut in, as it is drawn, and does not stop short of it; the band with it.
 */
function clipPlaced(
  s: ChartSeries,
  xs: number[],
  windowYears: number,
): ChartSeries {
  const keep = xs.filter((x) => x <= windowYears + 1e-9).length
  const carried = keep > 0 && keep < xs.length && xs[keep - 1]! < windowYears
  const cut = (
    values: number[],
    pre?: number[],
  ) => cutAt(values, pre, xs, keep, windowYears)
  const line = cut(s.values, s.preStep)
  const lo = s.band ? cut(s.band.lo, s.band.loPre) : null
  const hi = s.band ? cut(s.band.hi, s.band.hiPre) : null
  return {
    ...s,
    xs: carried ? [...xs.slice(0, keep), windowYears] : xs.slice(0, keep),
    values: line.values,
    ...(line.pre ? { preStep: line.pre } : {}),
    ...(lo && hi
      ? {
          band: {
            lo: lo.values,
            hi: hi.values,
            ...(lo.pre ? { loPre: lo.pre } : {}),
            ...(hi.pre ? { hiPre: hi.pre } : {}),
          },
        }
      : {}),
  }
}

/** A band cut to `keep` places, with the edges' steps cut alongside so the line stays inside it. */
function clipBand(
  band: NonNullable<ChartSeries['band']>,
  keep: number,
): NonNullable<ChartSeries['band']> {
  return {
    lo: band.lo.slice(0, keep),
    hi: band.hi.slice(0, keep),
    ...(band.loPre ? { loPre: band.loPre.slice(0, keep) } : {}),
    ...(band.hiPre ? { hiPre: band.hiPre.slice(0, keep) } : {}),
  }
}

/** A marker or index in years, kept only if it lies inside the window. */
export function insideWindow(
  yearIndex: number | undefined,
  windowYears: number | null,
): boolean {
  if (yearIndex === undefined) return false
  return windowYears === null || yearIndex <= windowYears
}
