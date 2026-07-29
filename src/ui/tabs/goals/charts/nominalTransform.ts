import type { ChartSeries } from '../../../charts/LinearChart'

function nominalFactor(yearOffset: number, inflationRate: number): number {
  return Math.pow(1 + inflationRate, yearOffset)
}

export function applyNominalTransform(
  series: ChartSeries[],
  years: number[],
  inflationRate: number,
): ChartSeries[] {
  return series.map((s) => ({
    ...s,
    values: s.values.map((v, i) => Math.round(v * nominalFactor(years[i] ?? i, inflationRate))),
    // Scatter points are check-in actuals — already nominal (real broker-statement
    // values), so they are passed through untouched rather than inflated again.
    ...(s.band
      ? {
          band: {
            lo: s.band.lo.map((v, i) => Math.round(v * nominalFactor(years[i] ?? i, inflationRate))),
            hi: s.band.hi.map((v, i) => Math.round(v * nominalFactor(years[i] ?? i, inflationRate))),
          },
        }
      : {}),
  }))
}
