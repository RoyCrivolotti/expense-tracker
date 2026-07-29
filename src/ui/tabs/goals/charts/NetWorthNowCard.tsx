import { memo } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import type { Milestone } from '../../../../types'
import { fireNumber, formatCents, milestoneLabel } from '../../../../engine'
import { Card } from '../../../components/primitives'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import styles from '../goals.module.css'

/** "You are here" snapshot: invested today vs the FI target and next milestone. */
function NetWorthNowCardImpl({
  draft,
  milestones,
}: {
  draft: NewGoalScenario
  milestones: Milestone[]
}) {
  const format = useMoneyFormat()
  const current = draft.startInvestedCents
  const fiTarget = fireNumber(draft.annualSpendCents, draft.safeWithdrawalRate)
  const pct =
    fiTarget > 0 && draft.annualSpendCents > 0
      ? Math.min(100, Math.max(0, (current / fiTarget) * 100))
      : null
  const next = milestones.find((m) => m.amountCents > current) ?? null
  const nextMilestone = next ? milestoneLabel(next, (c) => formatCents(c, format)) : null

  return (
    <Card className={styles.chartCard}>
      <h3 className={styles.chartTitle}>Where you are today</h3>
      {pct != null ? (
        <>
          <ul className={styles.nowList}>
            <li>
              <strong>{formatCents(current, format)}</strong> invested
            </li>
            <li>
              <strong>{pct.toFixed(0)}%</strong> of your {formatCents(fiTarget, format)} FI target
              <span className={styles.nowListNote}>
                target is from future annual spend at FI, not current spending
              </span>
            </li>
            {nextMilestone != null ? (
              <li>
                Next milestone: <strong>{nextMilestone}</strong>
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
          {formatCents(current, format)} invested
          {nextMilestone != null ? ` · next milestone ${nextMilestone}` : ''}. Set annual spend at FI
          above to see progress toward a financial independence target.
        </p>
      )}
    </Card>
  )
}

export const NetWorthNowCard = memo(NetWorthNowCardImpl)
