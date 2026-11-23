import { areaPath, type ScatterPoint } from './linearScale'
import { steppedPoints, valueAtPlace } from './steppedPoints'
import styles from './charts.module.css'

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
  lineSeries: {
    id: string
    color: string
    values: number[]
    preStep?: number[] | undefined
    xs?: number[] | undefined
  }[]
}) {
  if (active == null) return null
  return (
    <>
      <line x1={focusX} x2={focusX} y1={yTop} y2={yTop + innerH} className={styles.crosshair} />
      {lineSeries.flatMap((s) => {
        const value = valueAtPlace(s, active)
        // A line that has ended, or not started, has no point at this year, and none is drawn at zero for it.
        if (value === undefined) return []
        return [
          <circle
            key={s.id}
            cx={focusX}
            cy={scaleY(value)}
            r={3.5}
            style={{ fill: s.color, stroke: 'var(--color-bg)' }}
            strokeWidth={1.5}
          />,
        ]
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
            <line x1={x0} x2={x1} y1={y} y2={y} className={t === 0 ? styles.axisLine : styles.gridLine} />
            <text x={x0 - 8} y={y} textAnchor="end" dominantBaseline="middle" className={styles.yLabel}>
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
  loPre,
  hiPre,
  xForIndex,
  scaleY,
  fillOpacity = 0.18,
}: {
  color: string
  lo: number[]
  hi: number[]
  /** What each edge reached just before its value, where a payment or event steps it (see `steppedPoints`). */
  loPre?: number[] | undefined
  hiPre?: number[] | undefined
  xForIndex: (i: number) => number
  scaleY: (v: number) => number
  fillOpacity?: number
}) {
  const top = steppedPoints(hi, hiPre, xForIndex, scaleY)
  const bottom = steppedPoints(lo, loPre, xForIndex, scaleY)
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
