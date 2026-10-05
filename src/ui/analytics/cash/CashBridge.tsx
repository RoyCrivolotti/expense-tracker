import type { BridgeSegment, CashRow } from '../../../engine'
import { cashBridge, formatCents } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import styles from './cash.module.css'

function barFor(segment: BridgeSegment, maxAbs: number): { width: number; cls: string } {
  const width = (Math.abs(segment.cents) / maxAbs) * 100
  if (segment.kind === 'in') return { width, cls: styles.bridgeIn! }
  if (segment.kind === 'out') return { width, cls: styles.bridgeOut! }
  return { width, cls: styles.bridgeLevel! }
}

/** The walk from opening cash to expected cash, one labelled row per step. */
export function CashBridge({ row }: { row: CashRow }) {
  const format = useMoneyFormat()
  const segments = cashBridge(row)
  const maxAbs = Math.max(1, ...segments.map((s) => Math.abs(s.cents)))
  return (
    <div className={styles.bridge}>
      {segments.map((segment) => {
        const bar = barFor(segment, maxAbs)
        return (
          <div key={segment.key} className={styles.bridgeRow}>
            <span className={styles.bridgeLabel}>{segment.label}</span>
            <span className={styles.bridgeTrack} aria-hidden>
              <i className={bar.cls} style={{ width: `${bar.width}%` }} />
            </span>
            <span className={styles.bridgeAmount}>{formatCents(segment.cents, format)}</span>
          </div>
        )
      })}
    </div>
  )
}
