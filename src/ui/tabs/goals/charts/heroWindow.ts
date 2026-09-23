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
    series: series.map((s) => ({
      ...s,
      values: s.values.slice(0, keep),
      ...(s.band ? { band: { lo: s.band.lo.slice(0, keep), hi: s.band.hi.slice(0, keep) } } : {}),
      ...(s.points ? { points: s.points.filter((p) => p.xIndex <= windowYears) } : {}),
    })),
  }
}

/** A marker or index in years, kept only if it lies inside the window. */
export function insideWindow(yearIndex: number | undefined, windowYears: number | null): boolean {
  if (yearIndex === undefined) return false
  return windowYears === null || yearIndex <= windowYears
}
