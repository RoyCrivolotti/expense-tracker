import styles from './charts.module.css'

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
            textAnchor="middle"
            className={styles.axisLabel}
          >
            {label}
          </text>
        ) : null,
      )}
    </>
  )
}
