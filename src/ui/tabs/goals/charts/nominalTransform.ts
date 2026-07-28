import type { ChartSeries } from '../../../charts/LinearChart'

const NOMINAL_INFLATION = 0.02

export function applyNominalTransform(series: ChartSeries[], years: number[]): ChartSeries[] {
  return series.map((s) => ({
    ...s,
    values: s.values.map((v, i) => Math.round(v * Math.pow(1 + NOMINAL_INFLATION, years[i] ?? i))),
    ...(s.band
      ? {
          band: {
            lo: s.band.lo.map((v, i) =>
              Math.round(v * Math.pow(1 + NOMINAL_INFLATION, years[i] ?? i)),
            ),
            hi: s.band.hi.map((v, i) =>
              Math.round(v * Math.pow(1 + NOMINAL_INFLATION, years[i] ?? i)),
            ),
          },
        }
      : {}),
  }))
}
