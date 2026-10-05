import type { Allocation } from '../../../engine'
import { formatCentsCompact } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { Card } from '../../components/primitives'
import { ALLOCATION_NOTES } from '../analyticsCopy'
import { HowCalculated } from '../shared/HowCalculated'
import styles from './overview.module.css'

interface Segment {
  key: string
  label: string
  cents: number
  cls: string
}

function segmentsOf(a: Allocation): Segment[] {
  return [
    { key: 'fixed', label: 'Fixed', cents: a.fixedCents, cls: styles.segFixed! },
    { key: 'flexible', label: 'Flexible', cents: a.flexibleCents, cls: styles.segFlexible! },
    { key: 'invested', label: 'Invested', cents: a.investedCents, cls: styles.segInvested! },
    { key: 'left', label: 'Left over', cents: Math.max(0, a.leftoverCents), cls: styles.segLeft! },
  ].filter((s) => s.cents > 0)
}

/** One bar, four buckets: where the month's income went. */
export function AllocationBar({
  allocation,
  throughDay,
}: {
  allocation: Allocation
  /** Days of the open month counted so far, or null for a whole month. */
  throughDay: number | null
}) {
  const format = useMoneyFormat()
  if (allocation.incomeCents <= 0) return null
  const segments = segmentsOf(allocation)
  const pct = (cents: number) => (cents / allocation.incomeCents) * 100

  return (
    <Card>
      <h3 className={styles.cardTitle}>Where the income went</h3>
      <p className={styles.cardSub}>
        {throughDay === null
          ? `Of ${formatCentsCompact(allocation.incomeCents, format)} income this month.`
          : `Of ${formatCentsCompact(allocation.incomeCents, format)} income in the first ${throughDay} days.`}
      </p>
      <div className={styles.alloc} role="img" aria-label="Income split into fixed, flexible, invested and left over">
        {segments.map((s) => (
          <div key={s.key} className={s.cls} style={{ width: `${pct(s.cents)}%` }} />
        ))}
      </div>
      <div className={styles.allocList}>
        {segments.map((s) => (
          <div key={s.key} className={styles.allocRow}>
            <span className={`${styles.allocSwatch} ${s.cls}`} />
            <span className={styles.allocName}>{s.label}</span>
            <span className={styles.allocPct}>{pct(s.cents).toFixed(0)}%</span>
            <span className={styles.kvValue}>{formatCentsCompact(s.cents, format)}</span>
          </div>
        ))}
        {allocation.overspent && (
          <p className={styles.allocOver}>
            This month spent {formatCentsCompact(-allocation.leftoverCents, format)} more than it
            earned.
          </p>
        )}
      </div>
      <HowCalculated notes={ALLOCATION_NOTES} />
    </Card>
  )
}
