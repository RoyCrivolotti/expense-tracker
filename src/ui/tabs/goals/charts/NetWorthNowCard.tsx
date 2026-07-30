import { memo } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import type { Milestone } from '../../../../types'
import { fireNumber, formatCents, milestoneLabelWithAmount } from '../../../../engine'
import { Card } from '../../../components/primitives'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import styles from '../goals.module.css'

/** "You are here" snapshot: invested today vs the FI target and next milestone. */
function NetWorthNowCardImpl({
  draft,
  milestones,
  reached,
}: {
  draft: NewGoalScenario
  milestones: Milestone[]
  /** amountCents -> date first observed at or above, from check-in history. */
  reached: Map<number, string>
}) {
  const format = useMoneyFormat()
  const current = draft.startInvestedCents
  const fiTarget = fireNumber(draft.annualSpendCents, draft.safeWithdrawalRate)
  const pct =
    fiTarget > 0 && draft.annualSpendCents > 0
      ? Math.min(100, Math.max(0, (current / fiTarget) * 100))
      : null
  // Skip anything a check-in already recorded as reached, so a dip in the
  // portfolio does not re-suggest a milestone that was actually hit.
  const next =
    milestones.find((m) => m.amountCents > current && !reached.has(m.amountCents)) ?? null
  const nextMilestone = next ? milestoneLabelWithAmount(next, (c) => formatCents(c, format)) : null

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
