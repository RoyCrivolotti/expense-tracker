import type { CashRow } from '../../../engine'
import { CASH_DRIFT_TOLERANCE_CENTS, formatCents, shortMonthLabel } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import styles from './cash.module.css'

/** New drift per counted month, with the tolerance band it has to beat. */
export function DriftBars({ rows }: { rows: CashRow[] }) {
  const format = useMoneyFormat()
  const counted = rows.filter((r) => r.monthGapCents !== null)
  if (counted.length === 0) return null
  const maxAbs = Math.max(CASH_DRIFT_TOLERANCE_CENTS * 2, ...counted.map((r) => Math.abs(r.monthGapCents!)))
  const pct = (cents: number) => (Math.abs(cents) / maxAbs) * 50
  const tolPct = (CASH_DRIFT_TOLERANCE_CENTS / maxAbs) * 50

  return (
    <div className={styles.drift}>
      <div className={styles.driftHead}>
        <span>New drift per counted month</span>
        <span className={styles.driftTolerance}>
          band: ±{formatCents(CASH_DRIFT_TOLERANCE_CENTS, format)}
        </span>
      </div>
      {counted.map((row) => {
        const gap = row.monthGapCents!
        const over = Math.abs(gap) > CASH_DRIFT_TOLERANCE_CENTS
        return (
          <div key={row.month} className={styles.driftRow}>
            <span className={styles.driftMonth}>{shortMonthLabel(row.month)}</span>
            <span className={styles.driftTrack} aria-hidden>
              <i className={styles.driftBand} style={{ left: `${50 - tolPct}%`, width: `${tolPct * 2}%` }} />
              {gap !== 0 && (
                <i
                  className={over ? styles.driftOver : styles.driftOk}
                  style={{ width: `${pct(gap)}%`, [gap > 0 ? 'left' : 'right']: '50%' }}
                />
              )}
            </span>
            <span className={over ? styles.driftAmountOver : styles.driftAmount}>
              {formatCents(gap, format)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
