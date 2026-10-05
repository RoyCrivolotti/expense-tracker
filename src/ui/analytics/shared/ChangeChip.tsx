import styles from './shared.module.css'

/** Below this a money change reads as flat; rates use half a point. */
const FLAT_MONEY_PCT = 0.8
const FLAT_RATE_PTS = 0.5

interface Props {
  /** Current value: cents, or a 0–1 rate with kind 'rate'. */
  value: number
  /** Comparison value, or null when history doesn't reach. */
  baseline: number | null
  /** Whether a rise is the good direction (income yes, spending no). */
  upGood: boolean
  kind?: 'money' | 'rate'
}

function chipText(value: number, baseline: number, kind: 'money' | 'rate'): string | null {
  if (kind === 'rate') {
    const pts = (value - baseline) * 100
    if (Math.abs(pts) < FLAT_RATE_PTS) return null
    return `${pts > 0 ? '▲' : '▼'} ${Math.abs(pts).toFixed(0)} pts`
  }
  if (baseline === 0) return value === 0 ? null : 'new'
  const pct = ((value - baseline) / Math.abs(baseline)) * 100
  if (Math.abs(pct) < FLAT_MONEY_PCT) return null
  return `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%`
}

/** The change against a named baseline: direction, size, and whether that is good. */
export function ChangeChip({ value, baseline, upGood, kind = 'money' }: Props) {
  if (baseline === null) return <span className={styles.chip}>no comparison</span>
  const text = chipText(value, baseline, kind)
  if (text === null) return <span className={styles.chip}>flat</span>
  if (text === 'new') return <span className={styles.chip}>new</span>
  const up = text.startsWith('▲')
  const tone = upGood === up ? styles.chipGood : styles.chipBad
  return <span className={`${styles.chip} ${tone}`}>{text}</span>
}
