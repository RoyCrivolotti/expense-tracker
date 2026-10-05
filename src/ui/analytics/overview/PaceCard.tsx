import type { SpendingPace } from '../../../engine'
import { formatCentsCompact } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { Card } from '../../components/primitives'
import styles from './overview.module.css'

function fillClass(pace: SpendingPace): string {
  if (pace.flexibleSpentCents > pace.flexibleBudgetCents) return styles.meterOver!
  if (pace.flexibleSpentCents > pace.shouldBeTodayCents) return styles.meterWarn!
  return styles.meterOk!
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.kvRow}>
      <span>{label}</span>
      <span className={styles.kvValue}>{value}</span>
    </div>
  )
}

/** A refund-heavy month can sit below zero; the meter floor is still the left edge. */
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/**
 * Flexible spending against the pace the budget implies. Fixed costs are counted
 * but stay out of the clock — rent on the 1st is not "ahead of pace".
 */
export function PaceCard({ pace, isFuture }: { pace: SpendingPace; isFuture: boolean }) {
  const format = useMoneyFormat()
  if (pace.flexibleBudgetCents <= 0) return null
  const pct = clamp01(pace.flexibleSpentCents / pace.flexibleBudgetCents)
  const tickPct = clamp01(pace.shouldBeTodayCents / pace.flexibleBudgetCents)
  const ghostPct =
    pace.lastMonthSameDayCents !== null
      ? clamp01(pace.lastMonthSameDayCents / pace.flexibleBudgetCents)
      : null
  const closedNote = isFuture
    ? 'Not started — the pace clock only runs while a month is open.'
    : 'Closed month — the pace clock only runs while a month is open.'

  return (
    <Card>
      <h3 className={styles.cardTitle}>Flexible spending pace</h3>
      <p className={styles.cardSub}>
        {pace.open
          ? `Day ${pace.dayOfMonth} of ${pace.daysInMonth} — fixed costs are counted separately.`
          : closedNote}
      </p>
      <div className={styles.paceNumber}>
        {formatCentsCompact(pace.flexibleSpentCents, format)}
        <span className={styles.paceOf}> of {formatCentsCompact(pace.flexibleBudgetCents, format)}</span>
      </div>
      <div className={styles.meter}>
        <div className={`${styles.meterFill} ${fillClass(pace)}`} style={{ width: `${pct * 100}%` }} />
        {pace.open && (
          <div
            className={styles.meterTick}
            style={{ left: `${tickPct * 100}%` }}
            title="Where an even pace sits today"
          />
        )}
        {ghostPct !== null && (
          <div
            className={styles.meterGhost}
            style={{ left: `${ghostPct * 100}%` }}
            title="Last month, same days"
          />
        )}
      </div>
      <div className={styles.kvList}>
        {pace.open && (
          <Row label="Should be today" value={formatCentsCompact(pace.shouldBeTodayCents, format)} />
        )}
        {pace.open && (
          <Row label="At this pace, month ends near" value={formatCentsCompact(pace.projectedCents, format)} />
        )}
        {pace.lastMonthSameDayCents !== null && (
          <Row
            label={pace.open ? 'Last month, same days' : 'Month before, whole month'}
            value={formatCentsCompact(pace.lastMonthSameDayCents, format)}
          />
        )}
        <Row label="Fixed costs so far" value={formatCentsCompact(pace.fixedSpentCents, format)} />
      </div>
    </Card>
  )
}
