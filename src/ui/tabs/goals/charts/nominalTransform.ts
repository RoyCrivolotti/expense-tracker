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

/**
 * The plan is real, so the default view is today's money with the check-in dots deflated
 * to it; the nominal view inflates the plan instead and leaves the dots as they are. The
 * Y-axis floor covers both so toggling does not rescale the chart.
 *
 * `inflationRate` is the owner's assumed inflation, and the only one: it inflates the plan
 * and its band in the nominal view and deflates the dots in the other, the same rate every
 * other comparison with actuals uses, so the chart cannot disagree with the status beside it.
 */
export function computeChartDisplayData(
  series: ChartSeries[],
  extraSeries: ChartSeries[],
  years: number[],
  nominalMode: boolean,
  inflationRate: number,
  band: ChartSeries | null = null,
): {
  displaySeries: ChartSeries[]
  displayExtraSeries: ChartSeries[]
  displayBand: ChartSeries | null
  yDomainMax: number | undefined
} {
  const nominalSeries = inflateSeries(series, years, inflationRate)
  const values = [...series, ...nominalSeries].flatMap((s) => s.values)
  // The band is the line's own spread, so it goes up with the line or it bounds nothing.
  const displayBand = band && nominalMode ? (inflateSeries([band], years, inflationRate)[0] ?? null) : band
  return {
    displaySeries: nominalMode ? nominalSeries : series,
    displayExtraSeries: nominalMode ? extraSeries : deflatePoints(extraSeries, inflationRate),
    displayBand,
    yDomainMax: values.length > 0 ? Math.max(...values) : undefined,
  }
}
