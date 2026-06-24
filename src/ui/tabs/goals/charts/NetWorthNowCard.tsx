import { memo } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { fireNumber, formatCents, MILESTONE_CENTS } from '../../../../engine'
import { Card } from '../../../components/primitives'
import styles from '../goals.module.css'

/** "You are here" snapshot: invested today vs the FI target and next milestone. */
function NetWorthNowCardImpl({ draft }: { draft: NewGoalScenario }) {
  const current = draft.startInvestedCents
  const fiTarget = fireNumber(draft.annualSpendCents, draft.safeWithdrawalRate)
  const pct = fiTarget > 0 ? Math.min(100, Math.max(0, (current / fiTarget) * 100)) : 0
  const nextMilestone = MILESTONE_CENTS.find((m) => m > current) ?? null

  return (
    <Card className={styles.chartCard}>
      <h3 className={styles.chartTitle}>Where you are today</h3>
      <p className={styles.chartHint}>
        {formatCents(current)} invested · {pct.toFixed(0)}% of your {formatCents(fiTarget)} FI target
        {nextMilestone != null ? ` · next milestone ${formatCents(nextMilestone)}` : ''}
      </p>
      <div
        className={styles.progressTrack}
        role="img"
        aria-label={`${pct.toFixed(0)} percent of FI target reached`}
      >
        <div className={styles.progressFill} style={{ width: `${pct}%` }} />
      </div>
    </Card>
  )
}

export const NetWorthNowCard = memo(NetWorthNowCardImpl)
