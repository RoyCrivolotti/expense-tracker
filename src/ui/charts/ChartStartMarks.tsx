import styles from './charts.module.css'

/** Where a line that starts part-way along the axis begins: a hollow dot in its colour and when. */
export interface StartMark {
  /** Fractional x place, as the chart's own indices. */
  index: number
  value: number
  color: string
  label: string
}

/** Roughly what a character of the 11px label takes, to keep labels off each other without measuring. */
const CHAR_PX = 6.2
const GAP_PX = 8

interface Placed {
  mark: StartMark
  x: number
  y: number
  /** The label's box, or null where it was left off. */
  label: { x: number; anchor: 'start' | 'end'; left: number; right: number; top: number; bottom: number } | null
}

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

function overlaps(
  a: Box,
  b: Box,
): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

/** How far from a dot's centre a label has to stay: its radius and its stroke, and a pixel of air. */
const DOT_ROOM = 7

/**
 * Each mark's label beside its dot, above it and to the right, or to the left where the right has no
 * room. A label that would run into one already placed, or over another mark's dot, is left off rather
 * than drawn over it.
 */
function place(
  marks: StartMark[],
  xForIndex: (i: number) => number,
  scaleY: (v: number) => number,
  left: number,
  right: number,
  top: number,
): Placed[] {
  const placed: Placed[] = []
  const dots = marks.map((m) => ({
    left: xForIndex(m.index) - DOT_ROOM,
    right: xForIndex(m.index) + DOT_ROOM,
    top: scaleY(m.value) - DOT_ROOM,
    bottom: scaleY(m.value) + DOT_ROOM,
  }))
  for (const mark of [...marks].sort((a, b) => a.index - b.index)) {
    const x = xForIndex(mark.index)
    const y = scaleY(mark.value)
    const width = mark.label.length * CHAR_PX
    const toRight = x + GAP_PX + width <= right
    const labelY = Math.max(top + 10, y - 10)
    const box = toRight
      ? { x: x + GAP_PX, anchor: 'start' as const, left: x + GAP_PX, right: x + GAP_PX + width }
      : { x: x - GAP_PX, anchor: 'end' as const, left: x - GAP_PX - width, right: x - GAP_PX }
    const label = { ...box, top: labelY - 10, bottom: labelY + 3 }
    const clear = !placed.some((p) => p.label && overlaps(p.label, label)) && !dots.some((d) => overlaps(d, label))
    const fits = label.left >= left && clear
    placed.push({ mark, x, y, label: fits ? label : null })
  }
  return placed
}

/**
 * The start of each line that begins after the axis does: a hollow dot where it starts, so the line is
 * not read as coming up from nothing, and while nothing is pointed at, a label saying when.
 */
export function ChartStartMarks({
  marks,
  geo,
  left,
  right,
  active,
  annotations,
}: {
  marks: StartMark[] | undefined
  geo: { xForIndex: (i: number) => number; scaleY: (v: number) => number; padTop: number }
  left: number
  right: number
  /** The year pointed at: the values beside the dots then say what there is to say, so the labels go. */
  active: number | null
  /** A milestone's marks, which have labels of their own: these give way to them. */
  annotations: unknown
}) {
  if (!marks || marks.length === 0) return null
  const labels = active === null && !annotations
  return (
    <g aria-hidden>
      {place(marks, geo.xForIndex, geo.scaleY, left, right, geo.padTop).map(({ mark, x, y, label }) => (
        <g key={`${mark.color}-${mark.index}`}>
          <circle cx={x} cy={y} r={4.5} className={styles.annotationDot} style={{ stroke: mark.color }} />
          {labels && label ? (
            <text x={label.x} y={label.bottom - 3} textAnchor={label.anchor} className={styles.startLabel}>
              {mark.label}
            </text>
          ) : null}
        </g>
      ))}
    </g>
  )
}
