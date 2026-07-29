import type { ChartSeries } from '../../../charts/LinearChart'

export const NOMINAL_INFLATION = 0.02

function nominalFactor(yearOffset: number): number {
  return Math.pow(1 + NOMINAL_INFLATION, yearOffset)
}

export function applyNominalTransform(series: ChartSeries[], years: number[]): ChartSeries[] {
  return series.map((s) => ({
    ...s,
    values: s.values.map((v, i) => Math.round(v * nominalFactor(years[i] ?? i))),
    // Scatter points carry a fractional xIndex (years from plan start) — compound by that offset.
    ...(s.points
      ? {
          points: s.points.map((p) => ({
            ...p,
            value: Math.round(p.value * nominalFactor(p.xIndex)),
          })),
        }
      : {}),
    ...(s.band
      ? {
          band: {
            lo: s.band.lo.map((v, i) => Math.round(v * nominalFactor(years[i] ?? i))),
            hi: s.band.hi.map((v, i) => Math.round(v * nominalFactor(years[i] ?? i))),
          },
        }
      : {}),
  }))
}
