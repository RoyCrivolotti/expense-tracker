import type { ChartSeries } from '../../../charts/LinearChart'

function deflationFactor(yearOffset: number, inflationRate: number): number {
  return 1 / Math.pow(1 + inflationRate, yearOffset)
}

/** Deflate projected values to today's purchasing power. Scatter points (broker
 *  actuals) are left untouched — they're already in nominal terms by definition
 *  and should be deflated the same way as plan lines. */
export function applyRealTransform(
  series: ChartSeries[],
  years: number[],
  inflationRate: number,
): ChartSeries[] {
  return series.map((s) => ({
    ...s,
    values: s.values.map((v, i) => Math.round(v * deflationFactor(years[i] ?? i, inflationRate))),
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
