import type { SpendingBaseline } from '../../../engine'
import { formatCentsCompact } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { Card } from '../../components/primitives'
import { ChangeChip } from '../shared/ChangeChip'
import styles from './overview.module.css'

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={styles.kvRow}>
      <span>
        {label}
        {hint ? <span className={styles.kvHint}> {hint}</span> : null}
      </span>
      <span className={styles.kvValue}>{value}</span>
    </div>
  )
}

/**
 * What a year really costs, measured — the number Goals assumes, next to the
 * number the transactions prove. "Use in Goals" opens the scenario editor with
 * the measured spend prefilled as an unsaved draft: the save stays the user's.
 */
export function BaselineCard({
  baseline,
  onUseInGoals,
}: {
  baseline: SpendingBaseline
  onUseInGoals?: ((monthlyCents: number) => void) | undefined
}) {
  const format = useMoneyFormat()
  const compact = (cents: number) => formatCentsCompact(cents, format)
  return (
    <Card>
      <h3 className={styles.cardTitle}>Spending baseline</h3>
      <p className={styles.cardSub}>Measured over your last {baseline.months.length} closed months.</p>
      <div className={styles.kvList}>
        <Row label="Trailing spend, total" value={compact(baseline.totalCents)} />
        <Row label="Typical month, mean" value={compact(baseline.meanMonthlyCents)} />
        <Row label="Typical month, median" value={compact(baseline.medianMonthlyCents)} />
        <Row
          label="After instalments end"
          hint="(plans finishing within a year)"
          value={compact(baseline.runRateAfterInstallmentsCents)}
        />
        {baseline.planMonthlyCents !== null && (
          <div className={styles.kvRow}>
            <span>Goals plan assumes</span>
            <span className={styles.kvValue}>
              {compact(baseline.planMonthlyCents)}{' '}
              <ChangeChip
                value={baseline.meanMonthlyCents}
                baseline={baseline.planMonthlyCents}
                upGood={false}
              />
            </span>
          </div>
        )}
      </div>
      {onUseInGoals && (
        <button
          type="button"
          className={styles.useInGoals}
          onClick={() => onUseInGoals(baseline.meanMonthlyCents)}
        >
          Use in Goals
        </button>
      )}
    </Card>
  )
}
