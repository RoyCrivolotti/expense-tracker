import { useEffect, useId, useMemo, useRef, type RefObject } from 'react'
import { claimActiveTooltip, releaseActiveTooltip } from './activeTooltipRegistry'
import { ChartTooltip, type TooltipLine } from './ChartTooltip'
import { useElementSize } from '../hooks/useElementSize'
import {
  ChartGrid,
  ChartXLabels,
  ChartBandLayer,
  ChartScatterLayer,
  ChartTodayMarker,
  ChartAboveMarker,
  ChartPurchaseMarkers,
  ChartLifeEventMarkers,
  ChartFocusIndicator,
  type LifeEventMarker,
} from './linearChartParts'
import { ChartValueTags } from './ChartValueTags'
import { useChartFocus, type ChartFocusOptions } from './useChartFocus'
import { useSvgAnchor } from './useSvgAnchor'
import {
  collectDomain,
  linePath,
  makeScale,
  niceScale,
  spacedRefLines,
  stackAreas,
  type Pt,
  type ScatterPoint,
} from './linearScale'
import type { ValueTagSpec } from './valueTags'
import styles from './charts.module.css'

const FALLBACK_W = 360
/** The least a chart that fills its box is drawn at: below it there is no plot, only its margins. */
const MIN_FILL_H = 120
const PAD = { top: 16, right: 16, bottom: 28, left: 56 }
/** Reference lines closer than this run together into one dashed smear, so the nearer one is left out. */
const REF_LINE_MIN_GAP = 8

export type { ScatterPoint }

export interface ChartSeries {
  id: string
  color: string
  /**
   * Projection values aligned to x-axis indices. For 'scatter' kind, pass [].
   * A line may have fewer values than the axis has places, and then it ends where its values do:
   * the axis is as long as the longest one.
   */
  values: number[]
  kind?: 'line' | 'area' | 'scatter' | 'band'
  dashed?: boolean
  width?: number
  /** Paired lower/upper envelope values. Used only when kind === 'band'. */
  band?: { lo: number[]; hi: number[] }
  /** Sparse check-in actuals. Used only when kind === 'scatter'. */
  points?: ScatterPoint[]
  /** Join scatter points in x order, so readings over time read as a line. */
  connect?: boolean
  /** Draw a marker at each point. Off for a projection given as points, which is a line. */
  dots?: boolean
}

interface Props {
  height: number
  /**
   * Room above the plot, for the top axis label to sit in. A chart with little height to spare
   * can ask for less than the default.
   */
  padTop?: number
  series: ChartSeries[]
  xLabels: string[]
  formatValue: (v: number) => string
  ariaLabel: string
  tooltip: (index: number) => { title: string; lines: TooltipLine[] }
  refLines?: number[]
  markerYears?: { yearIndex: number }[]
  /** Life event markers: fractional x-axis indices with labels (e.g. year 3 → yearIndex 3). */
  lifeEventMarkers?: LifeEventMarker[]
  /** Index of the current year in the x-axis for a "today" vertical marker. */
  todayIndex?: number
  tooltipMode?: 'full' | 'hidden'
  /** Passed straight through to `ChartTooltip`; see its own doc comment. Defaults to true. */
  dockBelow?: boolean | undefined
  /** A target above the top of the chart (the FI number), marked on its top edge instead of stretching the axis to it. */
  aboveTop?: { label: string; title: string } | undefined
  onActiveIndexChange?: (index: number | null) => void
  /** Floor for the auto-computed Y-axis max: holds the scale still while what is drawn changes (a previewed inflation rate). */
  yDomainMax?: number | undefined
  /** Fit the Y axis to the values in view instead of anchoring it at zero. */
  fitDomain?: boolean
  /** How the focused year behaves; see `ChartFocusOptions`. Absent, it clears as it always has. */
  focus?: ChartFocusOptions
  /**
   * Draw at the height of the box the chart is in, which the caller gives a height of its own,
   * instead of at `height` (which is then only what it is drawn at before the box is measured).
   */
  fillHeight?: boolean
  /** Tag each line's value at the focused year with a chip beside its dot; see `ChartValueTags`. */
  valueTags?: ValueTagSpec | undefined
}

function pointsOf(values: number[], x: (i: number) => number, y: (v: number) => number): Pt[] {
  return values.map((v, i) => ({ x: x(i), y: y(v) }))
}

function useGeometry(
  series: ChartSeries[],
  width: number,
  height: number,
  refLines: number[],
  yDomainMax: number | undefined,
  fitDomain: boolean | undefined,
  padTopProp: number | undefined,
) {
  return useMemo(() => {
    // Kept inside the box: a padTop at or past the plot's bottom edge would give the clip
    // path a negative height and draw nothing, and a negative one pushes the plot off the top.
    const padTop = Math.max(0, Math.min(padTopProp ?? PAD.top, height - PAD.bottom - 1))
    const n = Math.max(
      0,
      ...series.filter((s) => s.kind !== 'scatter' && s.kind !== 'band').map((s) => s.values.length),
    )
    const innerH = height - padTop - PAD.bottom
    const innerW = width - PAD.left - PAD.right
    const areaSeries = series.filter((s) => s.kind === 'area')
    const stackedBands = stackAreas(areaSeries.map((a) => a.values))
    const stackedValues = stackedBands.flatMap((b) => [...b.lo, ...b.hi])
    const envelopeValues = series
      .filter((s) => s.kind === 'band')
      .flatMap((s) => (s.band ? [...s.band.lo, ...s.band.hi] : []))
    const scatterValues = series
      .filter((s) => s.kind === 'scatter')
      .flatMap((s) => s.points?.map((p) => p.value) ?? [])
    const lineValues = series
      .filter((s) => s.kind !== 'area' && s.kind !== 'band' && s.kind !== 'scatter')
      .flatMap((s) => s.values)
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
    const xForIndex = (i: number) =>
      n <= 1 ? PAD.left + innerW / 2 : PAD.left + (i / (n - 1)) * innerW
    return { n, padTop, innerH, innerW, stackedBands, areaSeries, ticks: nice.ticks, scaleY, xForIndex }
  }, [series, width, height, refLines, yDomainMax, fitDomain, padTopProp])
}

/**
 * The size the chart is drawn at: its wrapper's width, and its height prop, or the wrapper's own
 * once it has been measured when the chart fills its box (never so little that the plot is gone).
 */
function useChartBox(ref: RefObject<HTMLElement | null>, height: number, fillHeight: boolean | undefined) {
  const size = useElementSize(ref, { width: FALLBACK_W, height }, fillHeight)
  const measured = fillHeight && size.height > 0
  return { width: size.width, height: measured ? Math.max(MIN_FILL_H, size.height) : height }
}

function wrapClass(fillHeight: boolean | undefined): string | undefined {
  return fillHeight ? `${styles.chartWrap} ${styles.chartWrapFill}` : styles.chartWrap
}

/** One axis label per 26px of plot: closer than that, labels at 11px start to touch. */
function maxTicksFor(innerH: number): number {
  return Math.max(2, Math.floor(innerH / 26) + 1)
}

function domainTuple(d: { min: number; max: number }): [number, number] {
  return [d.min, d.max]
}

/** A tooltip shows only in 'full' mode: 'hidden' tracks focus for a caller's own readout instead. */
function tooltipShows(
  tip: { title: string; lines: TooltipLine[] } | null,
  tooltipMode: 'full' | 'hidden',
): boolean {
  return tip != null && tooltipMode === 'full'
}

/**
 * Arrow keys step a marker, so a chart is only worth a Tab stop when something shows where it
 * is: a tooltip, or a caller reading the focus through onActiveIndexChange (the hero chart's
 * legend). Without either it stays focusable by click but is not a silent stop in the Tab order.
 */
function tabIndexFor(
  tooltipMode: 'full' | 'hidden',
  onActiveIndexChange: Props['onActiveIndexChange'],
): 0 | -1 {
  return tooltipMode === 'full' || onActiveIndexChange !== undefined ? 0 : -1
}

/** What names the text that says how to use a chart from the keyboard, for the chart that can be. */
function describedBy(steppable: boolean, id: string): { 'aria-describedby'?: string } {
  return steppable ? { 'aria-describedby': id } : {}
}

/** Said to a screen reader as the description of a chart that takes focus; nothing on the chart says it. */
function StepKeysHint({ id, show }: { id: string; show: boolean }) {
  if (!show) return null
  return (
    <span id={id} className={styles.srOnly}>
      Use the left and right arrow keys to step through the years, Home and End to go to the first and last, and Escape to clear.
    </span>
  )
}

export function LinearChart({
  height,
  padTop,
  series,
  xLabels,
  formatValue,
  ariaLabel,
  tooltip,
  refLines = [],
  markerYears = [],
  lifeEventMarkers = [],
  todayIndex,
  tooltipMode = 'full',
  dockBelow,
  aboveTop,
  onActiveIndexChange,
  yDomainMax,
  fitDomain,
  focus,
  fillHeight,
  valueTags,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  // useId can return characters (colons, in older React) that a url(#...) reference does not take.
  const uid = useId().replace(/:/g, '')
  const plotClipId = `plot-${uid}`
  const keysId = `keys-${uid}`
  const containerRef = useRef<HTMLDivElement>(null)
  // The viewBox is the wrapper's width in CSS pixels, so text, strokes and hit areas
  // render at their own size instead of being scaled up with the chart.
  const { width, height: drawnHeight } = useChartBox(containerRef, height, fillHeight)
  const geo = useGeometry(series, width, drawnHeight, refLines, yDomainMax, fitDomain, padTop)
  const { active, ...handlers } = useChartFocus(geo.n, geo.xForIndex, containerRef, focus)
  const focusX = active != null ? geo.xForIndex(active) : 0
  const anchor = useSvgAnchor(svgRef, active != null ? focusX : null, active != null ? geo.padTop : null)
  const tip = active != null ? tooltip(active) : null
  const showsTooltip = tooltipShows(tip, tooltipMode)
  const lineSeries = series.filter((s) => s.kind !== 'area' && s.kind !== 'band' && s.kind !== 'scatter')
  // A chart that takes focus can be stepped through with the keyboard, which nothing on it says.
  const steppable = tabIndexFor(tooltipMode, onActiveIndexChange) === 0

  useEffect(() => {
    onActiveIndexChange?.(active)
  }, [active, onActiveIndexChange])

  // Only one chart's tooltip stays open at a time across the page: claiming the registry
  // closes whoever had it before. Gated on showsTooltip, not `active`, so a chart tracking
  // focus without ever rendering a tooltip (tooltipMode="hidden") can never close a real one.
  useEffect(() => {
    if (showsTooltip) claimActiveTooltip(handlers.onBlur)
    else releaseActiveTooltip(handlers.onBlur)
    return () => releaseActiveTooltip(handlers.onBlur)
  }, [showsTooltip, handlers.onBlur])

  return (
    <div ref={containerRef} className={wrapClass(fillHeight)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${drawnHeight}`}
        className={styles.svg}
        role="img"
        aria-label={ariaLabel}
        {...describedBy(steppable, keysId)}
        tabIndex={tabIndexFor(tooltipMode, onActiveIndexChange)}
        onContextMenu={(e) => e.preventDefault()}
        {...handlers}
      >
        <ChartGrid
          ticks={geo.ticks}
          scaleY={geo.scaleY}
          x0={PAD.left}
          x1={width - PAD.right}
          formatValue={formatValue}
        />
        {geo.areaSeries.map((s, ai) => {
          const band = geo.stackedBands[ai]
          if (!band) return null
          return (
            <ChartBandLayer
              key={s.id}
              color={s.color}
              lo={band.lo}
              hi={band.hi}
              xForIndex={geo.xForIndex}
              scaleY={geo.scaleY}
              fillOpacity={0.4}
            />
          )
        })}
        <clipPath id={plotClipId}>
          <rect x={PAD.left - 1} y={geo.padTop} width={geo.innerW + 2} height={geo.innerH + 1} />
        </clipPath>
        <g clipPath={`url(#${plotClipId})`}>
          {series.filter((s) => s.kind === 'band').map((s) =>
            s.band ? (
              <ChartBandLayer
                key={s.id}
                color={s.color}
                lo={s.band.lo}
                hi={s.band.hi}
                xForIndex={geo.xForIndex}
                scaleY={geo.scaleY}
                fillOpacity={0.18}
              />
            ) : null,
          )}
        </g>
        {lineSeries.map((s) => (
          <path
            key={s.id}
            d={linePath(pointsOf(s.values, geo.xForIndex, geo.scaleY))}
            style={{ stroke: s.color }}
            fill="none"
            strokeWidth={s.width ?? 2}
            strokeDasharray={s.dashed ? '6 4' : undefined}
          />
        ))}
        {series.filter((s) => s.kind === 'scatter').map((s) => (
          <ChartScatterLayer
            key={s.id}
            color={s.color}
            points={s.points ?? []}
            xForIndex={geo.xForIndex}
            scaleY={geo.scaleY}
            connect={s.connect ?? false}
            dashed={s.dashed ?? false}
            dots={s.dots ?? true}
          />
        ))}
        {spacedRefLines(refLines, geo.scaleY, REF_LINE_MIN_GAP).map((v) => (
          <line
            key={v}
            x1={PAD.left}
            x2={width - PAD.right}
            y1={geo.scaleY(v)}
            y2={geo.scaleY(v)}
            className={styles.refLine}
          />
        ))}
        {todayIndex !== undefined && (
          <ChartTodayMarker
            x={geo.xForIndex(todayIndex)}
            yTop={geo.padTop}
            yBottom={geo.padTop + geo.innerH}
          />
        )}
        <ChartXLabels labels={xLabels} xForIndex={geo.xForIndex} y={drawnHeight - 8} />
        <ChartPurchaseMarkers
          markerYears={markerYears}
          xForIndex={geo.xForIndex}
          yTop={geo.padTop}
          innerH={geo.innerH}
        />
        <ChartLifeEventMarkers
          markers={lifeEventMarkers}
          xForIndex={geo.xForIndex}
          yTop={geo.padTop}
        />
        {/* Above the year marks, or a dashed vertical mark runs through its text. */}
        <ChartAboveMarker marker={aboveTop} x={PAD.left + 8} y={geo.padTop} />
        <ChartFocusIndicator
          active={active}
          focusX={focusX}
          yTop={geo.padTop}
          innerH={geo.innerH}
          scaleY={geo.scaleY}
          lineSeries={lineSeries}
        />
        <ChartValueTags
          spec={valueTags}
          active={active}
          focusX={focusX}
          width={width}
          yTop={geo.padTop}
          yBottom={geo.padTop + geo.innerH}
          scaleY={geo.scaleY}
          lines={lineSeries}
          bands={series.filter((s) => s.kind === 'band')}
        />
      </svg>
      <StepKeysHint id={keysId} show={steppable} />
      {tip && showsTooltip ? (
        <ChartTooltip anchor={anchor} chart={containerRef} title={tip.title} lines={tip.lines} dockBelow={dockBelow} />
      ) : null}
    </div>
  )
}
