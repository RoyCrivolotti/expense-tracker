import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { ChartTooltip, type TooltipLine } from './ChartTooltip'
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
import {
  collectDomain,
  linePath,
  makeScale,
  niceScale,
  stackAreas,
  type Pt,
  type ScatterPoint,
} from './linearScale'
import styles from './charts.module.css'

const W = 360
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
  onActiveIndexChange?: (index: number | null) => void
}

function pointsOf(values: number[], x: (i: number) => number, y: (v: number) => number): Pt[] {
  return values.map((v, i) => ({ x: x(i), y: y(v) }))
}

function useGeometry(series: ChartSeries[], height: number, refLines: number[]) {
  return useMemo(() => {
    const n = series.find((s) => s.kind !== 'scatter' && s.kind !== 'band')?.values.length ?? 0
    const innerH = height - PAD.top - PAD.bottom
    const innerW = W - PAD.left - PAD.right
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
    )
    const nice = niceScale(...domainTuple(domain))
    const scaleY = makeScale(nice.min, nice.max, PAD.top + innerH, PAD.top)
    const xForIndex = (i: number) =>
      n <= 1 ? PAD.left + innerW / 2 : PAD.left + (i / (n - 1)) * innerW
    return { n, innerH, stackedBands, areaSeries, ticks: nice.ticks, scaleY, xForIndex }
  }, [series, height, refLines])
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
  onActiveIndexChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const geo = useGeometry(series, height, refLines)
  const { active, containerRef, ...handlers } = useChartFocus(geo.n, geo.xForIndex)
  const focusX = active != null ? geo.xForIndex(active) : 0
  const anchor = useSvgAnchor(svgRef, active != null ? focusX : null, active != null ? PAD.top : null)
  const tip = active != null ? tooltip(active) : null
  const lineSeries = series.filter((s) => s.kind !== 'area' && s.kind !== 'band' && s.kind !== 'scatter')

  useEffect(() => {
    onActiveIndexChange?.(active)
  }, [active, onActiveIndexChange])

  return (
    <div ref={containerRef as RefObject<HTMLDivElement | null>} className={styles.chartWrap}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${height}`}
        className={styles.svg}
        role="img"
        aria-label={ariaLabel}
        onContextMenu={(e) => e.preventDefault()}
        {...handlers}
      >
        <ChartGrid
          ticks={geo.ticks}
          scaleY={geo.scaleY}
          x0={PAD.left}
          x1={W - PAD.right}
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
          />
        ))}
        {refLines.map((v) => (
          <line
            key={v}
            x1={PAD.left}
            x2={W - PAD.right}
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
      {tip && tooltipMode === 'full' ? (
        <ChartTooltip anchor={anchor} title={tip.title} lines={tip.lines} />
      ) : null}
    </div>
  )
}
