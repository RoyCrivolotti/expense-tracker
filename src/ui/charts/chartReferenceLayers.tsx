import { linePath, spacedRefLines } from './linearScale'
import { refLineClass } from './refLineClass'
import styles from './charts.module.css'

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
        <line
          key={v}
          x1={x1}
          x2={x2}
          y1={scaleY(v)}
          y2={scaleY(v)}
          className={refLineClass(v === pickedLine, !!highlight)}
        />
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
          className={refLineClass(
            highlight != null && 'curveId' in highlight && highlight.curveId === c.id,
            !!highlight,
          )}
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
            <text
              x={x}
              y={Math.max(top + 10, y + (k % 2 === 0 ? -9 : 17))}
              textAnchor="middle"
              className={styles.annotationLabel}
            >
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
