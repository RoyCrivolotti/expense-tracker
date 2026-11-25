import styles from './charts.module.css'

export interface LifeEventMarker {
  yearIndex: number
  label: string
  amountCents: number
  /** The year of its own plan it falls in, where that is not its place on the axis (a plan that starts part-way along it). */
  year?: number
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
      {markers.map(({ yearIndex, label, amountCents, year = yearIndex }) => {
        const x = xForIndex(yearIndex)
        const cy = yTop + 8
        const inflow = amountCents >= 0
        return (
          <g key={`le-${yearIndex}-${label}`} aria-label={label}>
            <title>{`${label} (year ${year})`}</title>
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
export function ChartTodayMarker({ x, yTop, yBottom }: { x: number; yTop: number; yBottom: number }) {
  return <line x1={x} x2={x} y1={yTop} y2={yBottom} className={styles.todayMarker} aria-hidden />
}
