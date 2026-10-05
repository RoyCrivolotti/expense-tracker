import styles from './shared.module.css'

const W = 80
const H = 24
const PAD = 2

/** A tiny trend line: shape only, no axes, with a dot on the latest value. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const x = (i: number) => PAD + (i / (values.length - 1)) * (W - PAD * 2)
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2)
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = values[values.length - 1]!
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.spark} role="img" aria-label={label}>
      <polyline points={points} className={styles.sparkLine} />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.5} className={styles.sparkDot} />
    </svg>
  )
}
