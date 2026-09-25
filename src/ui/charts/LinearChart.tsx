import { useEffect, useMemo, useRef } from 'react'
import { ChartTooltip, type TooltipLine } from './ChartTooltip'
import { useElementWidth } from '../hooks/useElementWidth'
import {
  ChartGrid,
  ChartXLabels,
  ChartBandLayer,
  ChartScatterLayer,
  ChartTodayMarker,
  ChartPurchaseMarkers,
  ChartLifeEventMarkers,
  ChartFocusIndicator,
  type LifeEventMarker,
} from './linearChartParts'
import { useChartFocus } from './useChartFocus'
import { useSvgAnchor } from './useSvgAnchor'
import { useTooltipSide } from './useTooltipSide'
import {
  collectDomain,
  linePath,
  makeScale,
  niceScale,
  stackAreas,
  type Pt,
  type ScatterPoint,
} from './linearScale'
import type { RefObject } from 'react'
import styles from './charts.module.css'

const FALLBACK_W = 360
const PAD = { top: 16, right: 16, bottom: 28, left: 56 }

export type { ScatterPoint }

export interface ChartSeries {
  id: string
  color: string
  /** Projection values aligned to x-axis indices. For 'scatter' kind, pass []. */
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
  /** An element below the chart that already shows the tapped point's values (the hero's legend): while it is fully on screen the tooltip stays away, so it does not cover what it repeats. */
  readoutRef?: RefObject<HTMLElement | null>
  onActiveIndexChange?: (index: number | null) => void
  /** Floor for the auto-computed Y-axis max — keeps the scale stable across re-renders that change value magnitude (e.g. a real/nominal display toggle). */
  yDomainMax?: number | undefined
  /** Fit the Y axis to the values in view instead of anchoring it at zero. */
  fitDomain?: boolean
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
) {
  return useMemo(() => {
    const n = series.find((s) => s.kind !== 'scatter' && s.kind !== 'band')?.values.length ?? 0
    const innerH = height - PAD.top - PAD.bottom
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
    const domain = collectDomain(
      [lineValues, stackedValues, envelopeValues, scatterValues],
      refLines,
      fitDomain !== true,
    )
    // yDomainMax raises the floor rather than overriding outright, so a caller
    // locking the scale (e.g. real/nominal toggle) can never clip band/scatter
    // data that legitimately extends past it.
    const effectiveMax = yDomainMax !== undefined ? Math.max(domain.max, yDomainMax) : domain.max
    const nice = niceScale(...domainTuple({ min: domain.min, max: effectiveMax }))
    const scaleY = makeScale(nice.min, nice.max, PAD.top + innerH, PAD.top)
    const xForIndex = (i: number) =>
      n <= 1 ? PAD.left + innerW / 2 : PAD.left + (i / (n - 1)) * innerW
    return { n, innerH, stackedBands, areaSeries, ticks: nice.ticks, scaleY, xForIndex }
  }, [series, width, height, refLines, yDomainMax, fitDomain])
}

function domainTuple(d: { min: number; max: number }): [number, number] {
  return [d.min, d.max]
}

export function LinearChart({
  height,
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
  readoutRef,
  onActiveIndexChange,
  yDomainMax,
  fitDomain,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // The viewBox is the wrapper's width in CSS pixels, so text, strokes and hit areas
  // render at their own size instead of being scaled up with the chart.
  const width = useElementWidth(containerRef, FALLBACK_W)
  const geo = useGeometry(series, width, height, refLines, yDomainMax, fitDomain)
  const { active, ...handlers } = useChartFocus(geo.n, geo.xForIndex, containerRef)
  const focusX = active != null ? geo.xForIndex(active) : 0
  const anchor = useSvgAnchor(svgRef, active != null ? focusX : null, active != null ? PAD.top : null)
  const tip = active != null ? tooltip(active) : null
  const { side, show } = useTooltipSide(active != null, containerRef, {
    enabled: tooltipMode === 'full',
    unlessVisible: readoutRef,
  })
  const lineSeries = series.filter((s) => s.kind !== 'area' && s.kind !== 'band' && s.kind !== 'scatter')

  useEffect(() => {
    onActiveIndexChange?.(active)
  }, [active, onActiveIndexChange])

  return (
    <div ref={containerRef} className={styles.chartWrap}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className={styles.svg}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
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
        {refLines.filter(Number.isFinite).map((v) => (
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
            yTop={PAD.top}
            yBottom={PAD.top + geo.innerH}
          />
        )}
        <ChartXLabels labels={xLabels} xForIndex={geo.xForIndex} y={height - 8} />
        <ChartPurchaseMarkers
          markerYears={markerYears}
          xForIndex={geo.xForIndex}
          yTop={PAD.top}
          innerH={geo.innerH}
        />
        <ChartLifeEventMarkers
          markers={lifeEventMarkers}
          xForIndex={geo.xForIndex}
          yTop={PAD.top}
        />
        <ChartFocusIndicator
          active={active}
          focusX={focusX}
          yTop={PAD.top}
          innerH={geo.innerH}
          scaleY={geo.scaleY}
          lineSeries={lineSeries}
        />
      </svg>
      {tip && show ? (
        <ChartTooltip anchor={anchor} side={side} title={tip.title} lines={tip.lines} />
      ) : null}
    </div>
  )
}
