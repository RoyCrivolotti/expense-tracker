import { areaPath, type ScatterPoint } from './linearScale'
import styles from './charts.module.css'

export interface LifeEventMarker {
  yearIndex: number
  label: string
  amountCents: number
}

export function ChartFocusIndicator({
  active,
  focusX,
  yTop,
  innerH,
  scaleY,
  lineSeries,
}: {
  active: number | null
  focusX: number
  yTop: number
  innerH: number
  scaleY: (v: number) => number
  lineSeries: { id: string; color: string; values: number[] }[]
}) {
  if (active == null) return null
  return (
    <>
      <line
        x1={focusX} x2={focusX}
        y1={yTop} y2={yTop + innerH}
        className={styles.crosshair}
      />
      {lineSeries.map((s) => (
        <circle
          key={s.id}
          cx={focusX}
          cy={scaleY(s.values[active] ?? 0)}
          r={3.5}
          style={{ fill: s.color, stroke: 'var(--color-bg)' }}
          strokeWidth={1.5}
        />
      ))}
    </>
  )
}

export function ChartPurchaseMarkers({
  markerYears,
  xForIndex,
  yTop,
  innerH,
}: {
  markerYears: { yearIndex: number }[]
  xForIndex: (i: number) => number
  yTop: number
  innerH: number
}) {
  return (
    <>
      {markerYears.map(({ yearIndex }) => {
        const x = xForIndex(yearIndex)
        const yBottom = yTop + innerH
        return (
          <g key={yearIndex} aria-hidden>
            <line x1={x} x2={x} y1={yTop} y2={yBottom} className={styles.eventMarker} />
            <line x1={x} x2={x} y1={yBottom} y2={yBottom + 4} className={styles.eventMarkerTick} />
          </g>
        )
      })}
    </>
  )
}

export function ChartLifeEventMarkers({
  markers,
  xForIndex,
  yTop,
}: {
  markers: LifeEventMarker[]
  xForIndex: (i: number) => number
  yTop: number
}) {
  return (
    <>
      {markers.map(({ yearIndex, label, amountCents }) => {
        const x = xForIndex(yearIndex)
        const cy = yTop + 8
        const inflow = amountCents >= 0
        return (
          <g key={`le-${yearIndex}-${label}`} aria-label={label}>
            <title>{`${label} (year ${yearIndex})`}</title>
            <polygon
              points={`${x},${cy - 6} ${x + 5},${cy} ${x},${cy + 6} ${x - 5},${cy}`}
              className={inflow ? styles.lifeEventInflow : styles.lifeEventOutflow}
            />
          </g>
        )
      })}
    </>
  )
}

/** Horizontal grid lines + Y tick labels, with the zero line drawn solid. */
export function ChartGrid({
  ticks,
  scaleY,
  x0,
  x1,
  formatValue,
}: {
  ticks: number[]
  scaleY: (v: number) => number
  x0: number
  x1: number
  formatValue: (v: number) => string
}) {
  return (
    <>
      {ticks.map((t) => {
        const y = scaleY(t)
        return (
          <g key={t}>
            <line
              x1={x0}
              x2={x1}
              y1={y}
              y2={y}
              className={t === 0 ? styles.axisLine : styles.gridLine}
            />
            <text
              x={x0 - 8}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              className={styles.yLabel}
            >
              {formatValue(t)}
            </text>
          </g>
        )
      })}
    </>
  )
}

/** Filled band between paired lo/hi value arrays (not stacked). */
export function ChartBandLayer({
  color,
  lo,
  hi,
  xForIndex,
  scaleY,
  fillOpacity = 0.18,
}: {
  color: string
  lo: number[]
  hi: number[]
  xForIndex: (i: number) => number
  scaleY: (v: number) => number
  fillOpacity?: number
}) {
  const top = hi.map((v, i) => ({ x: xForIndex(i), y: scaleY(v) }))
  const bottom = lo.map((v, i) => ({ x: xForIndex(i), y: scaleY(v) }))
  return (
    <path
      d={areaPath(top, bottom)}
      style={{ fill: color, stroke: color }}
      fillOpacity={fillOpacity}
      strokeOpacity={0.5}
      strokeWidth={1}
      aria-hidden
    />
  )
}

/** Scatter dots for sparse check-in actuals at fractional x positions. */
export function ChartScatterLayer({
  color,
  points,
  xForIndex,
  scaleY,
  connect = false,
  dashed = false,
  dots = true,
}: {
  color: string
  points: ScatterPoint[]
  xForIndex: (i: number) => number
  scaleY: (v: number) => number
  /** Join the points in x order, so a series of readings shows how it moved. */
  connect?: boolean
  dashed?: boolean
  /** Off for a projection given as points: the joining line is the drawing, not the points. */
  dots?: boolean
}) {
  const ordered = connect ? [...points].sort((a, b) => a.xIndex - b.xIndex) : []
  return (
    <>
      {ordered.length > 1 ? (
        <path
          d={ordered
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${xForIndex(p.xIndex).toFixed(1)},${scaleY(p.value).toFixed(1)}`)
            .join(' ')}
          fill="none"
          strokeWidth={2}
          strokeDasharray={dashed ? '2 4' : undefined}
          style={{ stroke: color }}
          className={styles.scatterLine}
        />
      ) : null}
      {(dots ? points : []).map((p, i) => (
        <circle
          key={i}
          cx={xForIndex(p.xIndex)}
          cy={scaleY(p.value)}
          r={4.5}
          style={{ fill: color, stroke: 'var(--color-bg)' }}
          strokeWidth={2}
          className={styles.scatterDot}
        />
      ))}
    </>
  )
}

/**
 * A target above the top of the chart, marked on its top edge: an arrow pointing up and the
 * amount. The axis does not stretch to it (it would squeeze the plan flat), but it is not
 * forgotten either.
 */
export function ChartAboveMarker({
  marker,
  x,
  y,
}: {
  marker: { label: string; title: string } | undefined
  x: number
  y: number
}) {
  if (!marker) return null
  return (
    <g className={styles.aboveMarker}>
      <title>{marker.title}</title>
      <path d={`M${x} ${y + 9} L${x + 4} ${y + 2} L${x + 8} ${y + 9} Z`} />
      <text x={x + 13} y={y + 9}>
        {marker.label}
      </text>
    </g>
  )
}

/** Solid vertical "today" marker line. */
export function ChartTodayMarker({
  x,
  yTop,
  yBottom,
}: {
  x: number
  yTop: number
  yBottom: number
}) {
  return (
    <line
      x1={x} x2={x}
      y1={yTop} y2={yBottom}
      className={styles.todayMarker}
      aria-hidden
    />
  )
}

/** X axis labels at the chart baseline; pass '' to skip an index. */
export function ChartXLabels({
  labels,
  xForIndex,
  y,
}: {
  labels: string[]
  xForIndex: (i: number) => number
  y: number
}) {
  return (
    <>
      {labels.map((label, i) =>
        label ? (
          <text
            key={`${label}-${i}`}
            x={xForIndex(i)}
            y={y}
            // The end labels sit on the plot's edges; centred there, half of each
            // would fall outside the SVG.
            textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}
            className={styles.axisLabel}
          >
            {label}
          </text>
        ) : null,
      )}
    </>
  )
}
