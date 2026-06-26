import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { ChartTooltip, type TooltipLine } from './ChartTooltip'
import { ChartGrid, ChartXLabels } from './linearChartParts'
import { useChartFocus } from './useChartFocus'
import { useSvgAnchor } from './useSvgAnchor'
import {
  areaPath,
  collectDomain,
  linePath,
  makeScale,
  niceScale,
  stackAreas,
  type Pt,
} from './linearScale'
import styles from './charts.module.css'

const W = 360
const PAD = { top: 16, right: 16, bottom: 28, left: 56 }

export interface ChartSeries {
  id: string
  color: string
  values: number[]
  kind?: 'line' | 'area'
  dashed?: boolean
  width?: number
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
  tooltipMode?: 'full' | 'hidden'
  onActiveIndexChange?: (index: number | null) => void
}

function pointsOf(values: number[], x: (i: number) => number, y: (v: number) => number): Pt[] {
  return values.map((v, i) => ({ x: x(i), y: y(v) }))
}

function useGeometry(series: ChartSeries[], height: number, refLines: number[]) {
  return useMemo(() => {
    const n = series[0]?.values.length ?? 0
    const innerH = height - PAD.top - PAD.bottom
    const innerW = W - PAD.left - PAD.right
    const areaSeries = series.filter((s) => s.kind === 'area')
    const bands = stackAreas(areaSeries.map((a) => a.values))
    const bandValues = bands.flatMap((b) => [...b.lo, ...b.hi])
    const lineValues = series.filter((s) => s.kind !== 'area').flatMap((s) => s.values)
    const nice = niceScale(...domainTuple(collectDomain([lineValues, bandValues], refLines)))
    const scaleY = makeScale(nice.min, nice.max, PAD.top + innerH, PAD.top)
    const xForIndex = (i: number) =>
      n <= 1 ? PAD.left + innerW / 2 : PAD.left + (i / (n - 1)) * innerW
    return { n, innerH, bands, areaSeries, ticks: nice.ticks, scaleY, xForIndex }
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
  tooltipMode = 'full',
  onActiveIndexChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const geo = useGeometry(series, height, refLines)
  const { active, containerRef, ...handlers } = useChartFocus(geo.n, geo.xForIndex)
  const focusX = active != null ? geo.xForIndex(active) : 0
  const anchor = useSvgAnchor(svgRef, active != null ? focusX : null, active != null ? PAD.top : null)
  const tip = active != null ? tooltip(active) : null
  const lines = series.filter((s) => s.kind !== 'area')

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
          const band = geo.bands[ai]
          if (!band) return null
          const top = band.hi.map((v, i) => ({ x: geo.xForIndex(i), y: geo.scaleY(v) }))
          const bottom = band.lo.map((v, i) => ({ x: geo.xForIndex(i), y: geo.scaleY(v) }))
          return (
            <path
              key={s.id}
              d={areaPath(top, bottom)}
              style={{ fill: s.color, stroke: s.color }}
              fillOpacity={0.4}
              strokeOpacity={0.7}
              strokeWidth={1}
            />
          )
        })}
        {lines.map((s) => (
          <path
            key={s.id}
            d={linePath(pointsOf(s.values, geo.xForIndex, geo.scaleY))}
            style={{ stroke: s.color }}
            fill="none"
            strokeWidth={s.width ?? 2}
            strokeDasharray={s.dashed ? '6 4' : undefined}
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
        <ChartXLabels labels={xLabels} xForIndex={geo.xForIndex} y={height - 8} />
        {markerYears.map(({ yearIndex }) => {
          const x = geo.xForIndex(yearIndex)
          const yBottom = PAD.top + geo.innerH
          return (
            <g key={yearIndex} aria-hidden>
              <line
                x1={x}
                x2={x}
                y1={PAD.top}
                y2={yBottom}
                className={styles.eventMarker}
              />
              <line
                x1={x}
                x2={x}
                y1={yBottom}
                y2={yBottom + 4}
                className={styles.eventMarkerTick}
              />
            </g>
          )
        })}
        {active != null && (
          <>
            <line
              x1={focusX}
              x2={focusX}
              y1={PAD.top}
              y2={PAD.top + geo.innerH}
              className={styles.crosshair}
            />
            {lines.map((s) => (
              <circle
                key={s.id}
                cx={focusX}
                cy={geo.scaleY(s.values[active] ?? 0)}
                r={3.5}
                style={{ fill: s.color, stroke: 'var(--color-bg)' }}
                strokeWidth={1.5}
              />
            ))}
          </>
        )}
      </svg>
      {tip && tooltipMode === 'full' ? (
        <ChartTooltip anchor={anchor} title={tip.title} lines={tip.lines} />
      ) : null}
    </div>
  )
}
