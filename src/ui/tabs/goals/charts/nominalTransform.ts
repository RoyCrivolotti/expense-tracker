import type { ChartSeries } from '../../../charts/LinearChart'

function deflationFactor(yearOffset: number, inflationRate: number): number {
  return 1 / Math.pow(1 + inflationRate, yearOffset)
}

/**
 * Deflate a series to today's purchasing power.
 *
 * Scatter points (check-in actuals) are deflated too, by their own fractional
 * `xIndex` rather than an array position — they are nominal figures off a broker
 * statement, so leaving them alone while the plan line drops makes a portfolio that
 * is exactly on track read as far ahead of it.
 */
export function applyRealTransform(
  series: ChartSeries[],
  years: number[],
  inflationRate: number,
): ChartSeries[] {
  return series.map((s) => ({
    ...s,
    values: s.values.map((v, i) => Math.round(v * deflationFactor(years[i] ?? i, inflationRate))),
    ...(s.points
      ? {
          points: s.points.map((p) => ({
            ...p,
            value: Math.round(p.value * deflationFactor(p.xIndex, inflationRate)),
          })),
        }
      : {}),
    ...(s.band
      ? {
          band: {
            lo: s.band.lo.map((v, i) => Math.round(v * deflationFactor(years[i] ?? i, inflationRate))),
            hi: s.band.hi.map((v, i) => Math.round(v * deflationFactor(years[i] ?? i, inflationRate))),
          },
        }
      : {}),
  }))
}
