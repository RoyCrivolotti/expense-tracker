import { memo } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { fireNumber, formatCents, MILESTONE_CENTS } from '../../../../engine'
import { Card } from '../../../components/primitives'
import styles from '../goals.module.css'

/** "You are here" snapshot: invested today vs the FI target and next milestone. */
function NetWorthNowCardImpl({ draft }: { draft: NewGoalScenario }) {
  const current = draft.startInvestedCents
  const fiTarget = fireNumber(draft.annualSpendCents, draft.safeWithdrawalRate)
  const pct =
    fiTarget > 0 && draft.annualSpendCents > 0
      ? Math.min(100, Math.max(0, (current / fiTarget) * 100))
      : null
  const nextMilestone = MILESTONE_CENTS.find((m) => m > current) ?? null

  return (
    <Card className={styles.chartCard}>
      <h3 className={styles.chartTitle}>Where you are today</h3>
      {pct != null ? (
        <>
          <ul className={styles.nowList}>
            <li>
              <strong>{formatCents(current)}</strong> invested
            </li>
            <li>
              <strong>{pct.toFixed(0)}%</strong> of your {formatCents(fiTarget)} FI target
              <span className={styles.nowListNote}>
                target is from future annual spend at FI, not current spending
              </span>
            </li>
            {nextMilestone != null ? (
              <li>
                Next milestone: <strong>{formatCents(nextMilestone)}</strong>
              </li>
            ) : null}
          </ul>
          <div
            className={styles.progressTrack}
            role="img"
            aria-label={`${pct.toFixed(0)} percent of FI target reached`}
          >
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
          </div>
        </>
      ) : (
        <p className={styles.chartHint}>
          {formatCents(current)} invested
          {nextMilestone != null ? ` · next milestone ${formatCents(nextMilestone)}` : ''}. Set
          annual spend at FI above to see progress toward a financial independence target.
        </p>
      )}
    </Card>
  )
}

export const NetWorthNowCard = memo(NetWorthNowCardImpl)
