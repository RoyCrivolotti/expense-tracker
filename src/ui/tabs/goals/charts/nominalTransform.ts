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
 * What the saved rate's Nominal view would have drawn for the band, while a preview is up.
 * The band runs above the line, so it is what sets the axis there; without it in the floor
 * the axis would follow the preview instead of holding still.
 */
function previewAxisBand(
  band: ChartSeries | null,
  nominalMode: boolean,
  viewInflation: number | null,
  years: number[],
  inflationRate: number,
): number[] {
  if (!band || !nominalMode || viewInflation === null) return []
  return inflateSeries([band], years, inflationRate)[0]?.band?.hi ?? []
}

/**
 * The plan is real, so the default view is today's money with the check-in dots deflated
 * to it; the nominal view inflates the plan instead and leaves the dots as they are. The
 * Y-axis floor covers both so toggling does not rescale the chart.
 *
 * `inflationRate` is the owner's assumed inflation: it inflates the plan and its band in the
 * nominal view and deflates the dots in the other, the same rate every other comparison with
 * actuals uses, so the chart cannot disagree with the status beside it.
 *
 * `viewInflation` is a preview of the nominal view under another rate. It changes what is
 * drawn there and nothing else. The axis floor is the one the saved rate gives that view,
 * band included, so stepping the preview moves the plan against a scale that holds still.
 * The chart itself grows the axis when a drawn line no longer fits, which it does rather
 * than clip.
 */
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
  yDomainMax: number | undefined
} {
  const nominalSeries = inflateSeries(series, years, inflationRate)
  const values = [...series, ...nominalSeries]
    .flatMap((s) => s.values)
    .concat(previewAxisBand(band, nominalMode, viewInflation, years, inflationRate))
  const drawnRate = viewInflation ?? inflationRate
  const drawnSeries = drawnRate === inflationRate ? nominalSeries : inflateSeries(series, years, drawnRate)
  // The band is the line's own spread, so it goes up with the line or it bounds nothing.
  const displayBand = band && nominalMode ? (inflateSeries([band], years, drawnRate)[0] ?? null) : band
  return {
    displaySeries: nominalMode ? drawnSeries : series,
    displayExtraSeries: nominalMode ? extraSeries : deflatePoints(extraSeries, inflationRate),
    displayRealPoints: drawnRealPoints(realPoints, nominalMode, drawnRate),
    displayBand,
    yDomainMax: values.length > 0 ? Math.max(...values) : undefined,
  }
}
