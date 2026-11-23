import { useMemo, type RefObject } from 'react'
import { useElementSize } from '../hooks/useElementSize'
import type { ChartSeries } from './LinearChart'
import { drawnValuesOf, placesOf } from './steppedPoints'
import { collectDomain, makeScale, niceScale, stackAreas } from './linearScale'

const FALLBACK_W = 360
/** The least a chart that fills its box is drawn at: below it there is no plot, only its margins. */
const MIN_FILL_H = 120
export const PAD = { top: 16, right: 16, bottom: 28, left: 56 }

function envelopeOf(s: ChartSeries): number[] {
  return s.band ? [...s.band.lo, ...s.band.hi, ...(s.band.loPre ?? []), ...(s.band.hiPre ?? [])] : []
}

export function useGeometry(
  series: ChartSeries[],
  width: number,
  height: number,
  refLines: number[],
  yDomainMax: number | undefined,
  fitDomain: boolean | undefined,
  padTopProp: number | undefined,
  places = 0,
) {
  return useMemo(() => {
    // Kept inside the box: a padTop at or past the plot's bottom edge would give the clip
    // path a negative height and draw nothing, and a negative one pushes the plot off the top.
    const padTop = Math.max(0, Math.min(padTopProp ?? PAD.top, height - PAD.bottom - 1))
    const n = Math.max(places, ...series.filter((s) => s.kind !== 'scatter' && s.kind !== 'band').map(placesOf))
    const innerH = height - padTop - PAD.bottom
    const innerW = width - PAD.left - PAD.right
    const areaSeries = series.filter((s) => s.kind === 'area')
    const stackedBands = stackAreas(areaSeries.map((a) => a.values))
    const stackedValues = stackedBands.flatMap((b) => [...b.lo, ...b.hi])
    const envelopeValues = series.filter((s) => s.kind === 'band').flatMap(envelopeOf)
    const scatterValues = series.filter((s) => s.kind === 'scatter').flatMap((s) => s.points?.map((p) => p.value) ?? [])
    const lineValues = series
      .filter((s) => s.kind !== 'area' && s.kind !== 'band' && s.kind !== 'scatter')
      .flatMap(drawnValuesOf)
    // A band is the spread around a line, not the thing being read: a wide one would set
    // the axis and leave the lines squeezed under it. It is held to the height of what it
    // surrounds and clipped there, so the axis fits the lines.
    const solidMax = Math.max(...[...lineValues, ...stackedValues, ...scatterValues].filter(Number.isFinite))
    const bandCap = solidMax > 0 ? solidMax : Infinity
    const domain = collectDomain(
      [lineValues, stackedValues, envelopeValues.map((v) => Math.min(v, bandCap)), scatterValues],
      refLines,
      fitDomain !== true,
    )
    // yDomainMax raises the floor rather than overriding outright, so a caller
    // holding the scale still (the Nominal view while a rate is previewed) can never
    // clip a line or check-in that legitimately extends past it.
    const effectiveMax = yDomainMax !== undefined ? Math.max(domain.max, yDomainMax) : domain.max
    const nice = niceScale(...domainTuple({ min: domain.min, max: effectiveMax }), 5, maxTicksFor(innerH))
    const scaleY = makeScale(nice.min, nice.max, padTop + innerH, padTop)
    const xForIndex = (i: number) => (n <= 1 ? PAD.left + innerW / 2 : PAD.left + (i / (n - 1)) * innerW)
    return { n, padTop, innerH, innerW, stackedBands, areaSeries, ticks: nice.ticks, scaleY, xForIndex }
  }, [series, width, height, refLines, yDomainMax, fitDomain, padTopProp, places])
}

/**
 * The size the chart is drawn at: its wrapper's width, and its height prop, or the wrapper's own
 * once it has been measured when the chart fills its box (never so little that the plot is gone).
 */
export function useChartBox(
  ref: RefObject<HTMLElement | null>,
  height: number,
  fillHeight: boolean | undefined,
) {
  const size = useElementSize(ref, { width: FALLBACK_W, height }, fillHeight)
  const measured = fillHeight && size.height > 0
  return { width: size.width, height: measured ? Math.max(MIN_FILL_H, size.height) : height }
}

/** One axis label per 26px of plot: closer than that, labels at 11px start to touch. */
function maxTicksFor(innerH: number): number {
  return Math.max(2, Math.floor(innerH / 26) + 1)
}

function domainTuple(d: { min: number; max: number }): [number, number] {
  return [d.min, d.max]
}

export type ChartGeometry = ReturnType<typeof useGeometry>
