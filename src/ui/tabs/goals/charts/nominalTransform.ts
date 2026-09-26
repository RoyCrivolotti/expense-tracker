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

/** A projection given as points is real like the lines: the nominal view inflates each by its own year. */
export function inflatePoints(series: ChartSeries[], inflationRate: number): ChartSeries[] {
  return series.map((s) =>
    s.points
      ? { ...s, points: s.points.map((p) => ({ ...p, value: Math.round(p.value * factor(p.xIndex, inflationRate)) })) }
      : s,
  )
}

/** Real point series as drawn: inflated with the lines in the nominal view, untouched otherwise. */
function drawnRealPoints(realPoints: ChartSeries[], nominalMode: boolean, rate: number): ChartSeries[] {
  return nominalMode ? inflatePoints(realPoints, rate) : realPoints
}

/**
 * The plan is real, so the default view is today's money with the check-in dots deflated
 * to it; the nominal view inflates the plan instead and leaves the dots as they are.
 *
 * `inflationRate` is the owner's assumed inflation: it inflates the plan and its band in the
 * nominal view and deflates the dots in the other, the same rate every other comparison with
 * actuals uses, so the chart cannot disagree with the status beside it.
 *
 * `viewInflation` is a preview of the nominal view under another rate. It changes what is
 * drawn there and nothing else. The axis floor is the height the saved rate gives that view,
 * so stepping the preview moves the plan against a scale that holds still. The chart itself
 * grows the axis when a drawn line no longer fits, which it does rather than clip.
 *
 * Each view fits its own axis: Purchasing power has no floor, so it is not stretched to make
 * room for the nominal plan, which runs far higher over thirty years. The band does not set
 * the axis in either view, so it is left out of the floor.
 */
export function computeChartDisplayData(
  series: ChartSeries[],
  extraSeries: ChartSeries[],
  years: number[],
  nominalMode: boolean,
  inflationRate: number,
  band: ChartSeries | null = null,
  viewInflation: number | null = null,
  /** Real projections drawn as points (the plan from today): inflated with the lines, never deflated. */
  realPoints: ChartSeries[] = [],
): {
  displaySeries: ChartSeries[]
  displayExtraSeries: ChartSeries[]
  displayRealPoints: ChartSeries[]
  displayBand: ChartSeries | null
  /** Floor for the chart's axis: the saved rate's Nominal height, and none in Purchasing power. */
  yDomainMax: number | undefined
  /** The highest value drawn in this view, band aside; what the reference lines are held to. */
  drawnMax: number | undefined
} {
  const nominalSeries = inflateSeries(series, years, inflationRate)
  const drawnRate = viewInflation ?? inflationRate
  const drawnSeries = drawnRate === inflationRate ? nominalSeries : inflateSeries(series, years, drawnRate)
  const displaySeries = nominalMode ? drawnSeries : series
  const displayExtraSeries = nominalMode ? extraSeries : deflatePoints(extraSeries, inflationRate)
  const displayRealPoints = drawnRealPoints(realPoints, nominalMode, drawnRate)
  // The band is the line's own spread, so it goes up with the line or it bounds nothing.
  const displayBand = band && nominalMode ? (inflateSeries([band], years, drawnRate)[0] ?? null) : band
  return {
    displaySeries,
    displayExtraSeries,
    displayRealPoints,
    displayBand,
    yDomainMax: nominalMode ? maxOf(nominalSeries.flatMap((s) => s.values)) : undefined,
    drawnMax: maxOf([
      ...displaySeries.flatMap((s) => s.values),
      ...[...displayExtraSeries, ...displayRealPoints].flatMap((s) => s.points?.map((p) => p.value) ?? []),
    ]),
  }
}

function maxOf(values: number[]): number | undefined {
  return values.length > 0 ? Math.max(...values) : undefined
}
