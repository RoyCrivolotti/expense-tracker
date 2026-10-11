import { areaPath, linePath, spacedRefLines, type ScatterPoint } from './linearScale'
import { refLineClass } from './refLineClass'
import { steppedPoints } from './steppedPoints'
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
      {lineSeries.flatMap((s) => {
        const value = s.values[active]
        // A line that has ended has no point at this year, and none is drawn at zero for it.
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

/** A dashed vertical line across the plot with a short label beside it: a turning point the chart has a name for. */
export interface LabeledMarker {
  /** Fractional x-axis index. */
  index: number
  label: string
  /** The long form, for a hover and a screen reader; the label is kept short to fit the plot. */
  title?: string
}

/** Rough width of a character at the label's size, which decides where a label has room. */
const LABEL_CHAR_WIDTH = 6.2
const LABEL_GAP = 6
const LABEL_ROW_HEIGHT = 14

interface PlacedLabel {
  marker: LabeledMarker
  x: number
  anchor: 'start' | 'end'
  row: number
}

/**
 * Where each label goes: to the right of its line, or to the left when it would run off the edge, or
 * from the plot's left edge when it fits on neither side, and on the next row down when it would run
 * into the label before it. A label never goes past the plot, where the axis labels are.
 */
function placeLabels(
  markers: readonly LabeledMarker[],
  xForIndex: (i: number) => number,
  left: number,
  right: number,
): PlacedLabel[] {
  const rowEnds: number[] = []
  return [...markers]
    .sort((a, b) => a.index - b.index)
    .map((marker) => {
      const line = xForIndex(marker.index)
      const width = marker.label.length * LABEL_CHAR_WIDTH
      const side: 'right' | 'left' | 'edge' =
        line + LABEL_GAP + width <= right ? 'right' : line - LABEL_GAP - width >= left ? 'left' : 'edge'
      const from = side === 'right' ? line + LABEL_GAP : side === 'left' ? line - LABEL_GAP - width : left + LABEL_GAP
      const free = rowEnds.findIndex((end) => from >= end + LABEL_GAP)
      const row = free >= 0 ? free : Math.min(rowEnds.length, 1)
      rowEnds[row] = Math.max(rowEnds[row] ?? 0, from + width)
      return { marker, x: side === 'left' ? line - LABEL_GAP : from, anchor: side === 'left' ? 'end' : 'start', row }
    })
}

export function ChartLabeledMarkers({
  markers,
  xForIndex,
  yTop,
  innerH,
  left,
  right,
}: {
  markers: readonly LabeledMarker[] | undefined
  xForIndex: (i: number) => number
  yTop: number
  innerH: number
  /** The plot's left and right edges: a label is kept between them. */
  left: number
  right: number
}) {
  if (!markers?.length) return null
  return (
    <>
      {placeLabels(markers, xForIndex, left, right).map(({ marker, x, anchor, row }) => (
        <g key={`${marker.index}-${marker.label}`}>
          {marker.title ? <title>{marker.title}</title> : null}
          <line
            x1={xForIndex(marker.index)}
            x2={xForIndex(marker.index)}
            y1={yTop}
            y2={yTop + innerH}
            className={styles.eventMarker}
            aria-hidden
          />
          <text x={x} y={yTop + 12 + row * LABEL_ROW_HEIGHT} textAnchor={anchor} className={styles.markerLabel}>
            {marker.label}
          </text>
        </g>
      ))}
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

/** The flat lines of a chart: those spaced apart, and the picked one, which is never left out for being close to another. */
export function ChartRefLines({
  values,
  scaleY,
  x1,
  x2,
  minGap,
  highlight = null,
}: {
  values: number[]
  scaleY: (v: number) => number
  x1: number
  x2: number
  minGap: number
  highlight?: RefHighlight
}) {
  const kept = spacedRefLines(values, scaleY, minGap)
  const pickedLine = highlight != null && 'line' in highlight ? highlight.line : null
  const drawn = pickedLine !== null && !kept.includes(pickedLine) ? [...kept, pickedLine] : kept
  return (
    <>
      {drawn.map((v) => (
        <line key={v} x1={x1} x2={x2} y1={scaleY(v)} y2={scaleY(v)} className={refLineClass(v === pickedLine, !!highlight)} />
      ))}
    </>
  )
}

/** Reference curves: thin dashed lines through one value per place, for a target that moves with the inflation. */
export function ChartRefCurves({
  curves,
  xForIndex,
  scaleY,
  highlight = null,
}: {
  curves: { id: string; values: number[] }[] | undefined
  xForIndex: (i: number) => number
  scaleY: (v: number) => number
  /** The reference line picked to stand out: its curve is solid and bright, and the others step back. */
  highlight?: RefHighlight
}) {
  return (
    <>
      {curves?.map((c) => (
        <path
          key={c.id}
          d={linePath(c.values.map((v, i) => ({ x: xForIndex(i), y: scaleY(v) })))}
          className={refLineClass(highlight != null && 'curveId' in highlight && highlight.curveId === c.id, !!highlight)}
          fill="none"
          aria-hidden
        />
      ))}
    </>
  )
}

/** The reference line picked to stand out: a flat line's value, or a curve's id. */
export type RefHighlight = { line: number } | { curveId: string } | null | undefined

/** A path reaching the picked line, marked where it does. */
export interface AnnotationDot {
  /** Fractional x place, as the chart's own indices. */
  index: number
  value: number
  color: string
  label: string
}

export interface ChartAnnotations {
  dots: AnnotationDot[]
  /** A note at the right end of the picked line: what it is, and what it is worth there. It sits below the end of a line that is falling, which would run through it above. */
  endNote?: { index: number; value: number; lines: string[]; below?: boolean } | undefined
}

/** The dots where paths reach the picked line, each with its label, and the note at the line's right end. */
export function ChartAnnotationLayer({
  annotations,
  xForIndex,
  scaleY,
  top,
  right,
}: {
  annotations: ChartAnnotations | undefined
  xForIndex: (i: number) => number
  scaleY: (v: number) => number
  /** The top of the plot, which a label is kept below. */
  top: number
  /** The right edge of the plot, which the note ends at. */
  right: number
}) {
  if (!annotations) return null
  const { dots, endNote } = annotations
  const ordered = [...dots].sort((a, b) => a.index - b.index)
  return (
    <g aria-hidden>
      {ordered.map((d, k) => {
        const x = xForIndex(d.index)
        const y = scaleY(d.value)
        return (
          <g key={`${d.color}-${k}`}>
            <circle cx={x} cy={y} r={4.5} className={styles.annotationDot} style={{ stroke: d.color }} />
            <text x={x} y={Math.max(top + 10, y + (k % 2 === 0 ? -9 : 17))} textAnchor="middle" className={styles.annotationLabel}>
              {d.label}
            </text>
          </g>
        )
      })}
      {endNote ? (
        <g>
          <circle cx={xForIndex(endNote.index)} cy={scaleY(endNote.value)} r={3} className={styles.annotationEnd} />
          {endNote.lines.map((line, k) => (
            <text
              key={line}
              x={Math.min(right, xForIndex(endNote.index)) - 8}
              y={Math.max(top + 10, scaleY(endNote.value) + (endNote.below ? 16 : -18) + k * 12)}
              textAnchor="end"
              className={k === 0 ? styles.annotationNote : styles.annotationNoteSub}
            >
              {line}
            </text>
          ))}
        </g>
      ) : null}
    </g>
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
