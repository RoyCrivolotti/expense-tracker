import type { ChartSeries } from '../../../charts/LinearChart'

function factor(yearOffset: number, inflationRate: number): number {
  return Math.pow(1 + inflationRate, yearOffset)
}

/**
 * The plan in the money of each future year. The projection is real, in today's money,
 * so the nominal view multiplies every drawn value and band edge up by the rate over its
 * year. Scatter points are left alone: check-ins are already nominal.
 */
export function inflateSeries(
  series: ChartSeries[],
  years: number[],
  inflationRate: number,
): ChartSeries[] {
  return series.map((s) => ({
    ...s,
    values: s.values.map((v, i) => Math.round(v * factor(years[i] ?? i, inflationRate))),
    ...(s.band
      ? {
          band: {
            lo: s.band.lo.map((v, i) => Math.round(v * factor(years[i] ?? i, inflationRate))),
            hi: s.band.hi.map((v, i) => Math.round(v * factor(years[i] ?? i, inflationRate))),
          },
        }
      : {}),
  }))
}

/**
 * Check-in points brought to today's money, each by its own fractional `xIndex`, so an
 * actual exactly on plan sits on the real line rather than reading as ahead of it.
 */
export function deflatePoints(series: ChartSeries[], inflationRate: number): ChartSeries[] {
  return series.map((s) =>
    s.points
      ? { ...s, points: s.points.map((p) => ({ ...p, value: Math.round(p.value / factor(p.xIndex, inflationRate)) })) }
      : s,
  )
}
