import { formatCentsCompact } from '../../engine/money'
import { CHART_W, PAD, yAt, yTickValues } from './chartLayout'
import styles from './charts.module.css'

interface Props {
  maxVal: number
  innerH: number
}

export function ChartYAxis({ maxVal, innerH }: Props) {
  const ticks = yTickValues(maxVal)
  const x0 = PAD.left
  const x1 = CHART_W - PAD.right
  const baseline = PAD.top + innerH

  return (
    <>
      <line x1={x0} x2={x1} y1={baseline} y2={baseline} className={styles.axisLine} />
      {ticks.map((t) => {
        const y = yAt(t, maxVal, innerH)
        return (
          <g key={t}>
            <line x1={x0} x2={x1} y1={y} y2={y} className={styles.gridLine} />
            <text x={x0 - 8} y={y} textAnchor="end" dominantBaseline="middle" className={styles.yLabel}>
              {formatCentsCompact(t)}
            </text>
          </g>
        )
      })}
    </>
  )
}
