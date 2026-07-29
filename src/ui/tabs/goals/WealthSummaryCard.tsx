import type { GoalScenario, WealthAccount, WealthCheckin } from '../../../types'
import type { TrackStatus } from '../../../engine'
import { Card } from '../../components/primitives'
import {
  checkinInvestedCents,
  checkinNetWorthCents,
  latestCheckin,
  trackStatus,
} from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import type { MoneyFormat } from '../../../engine/money'
import { formatMoneyShort } from './chartTheme'
import styles from './progress.module.css'
import goalStyles from './goals.module.css'

interface Props {
  checkins: WealthCheckin[]
  accounts: WealthAccount[]
  activeScenario: GoalScenario | null
}

function StatusRow({
  status,
  format,
}: {
  status: TrackStatus | null
  format: MoneyFormat
}) {
  if (!status) {
    return (
      <div className={styles.summaryStatus}>
        <span className={[styles.statusDot, styles.statusDotNeutral].join(' ')} />
        <span>No active plan to compare against</span>
      </div>
    )
  }
  const ahead = status.deltaCents >= 0
  return (
    <div className={styles.summaryStatus}>
      <span
        className={[
          styles.statusDot,
          ahead ? styles.statusDotAhead : styles.statusDotBehind,
        ].join(' ')}
      />
      <span>
        {ahead ? 'Ahead of plan' : 'Behind plan'}{' '}
        <span
          className={[
            styles.summaryDelta,
            ahead ? styles.summaryDeltaAhead : styles.summaryDeltaBehind,
          ].join(' ')}
        >
          ({ahead ? '+' : ''}{formatMoneyShort(status.deltaCents, format)})
        </span>
      </span>
    </div>
  )
}

function MonthsHint({ status }: { status: TrackStatus }) {
  const ahead = status.deltaCents >= 0
  const abs = Math.abs(status.deltaMonths)
  return (
    <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: 0 }}>
      Equivalent to being{' '}
      <strong style={{ color: ahead ? 'var(--exp-success)' : 'var(--exp-danger)' }}>
        {abs} month{abs !== 1 ? 's' : ''} {ahead ? 'ahead' : 'behind'}
      </strong>{' '}
      on contributions.
    </p>
  )
}

export function WealthSummaryCard({ checkins, accounts, activeScenario }: Props) {
  const format = useMoneyFormat()
  const latest = latestCheckin(checkins)

  if (!latest) {
    return (
      <Card>
        <h3 className={goalStyles.sectionTitle}>Progress snapshot</h3>
        <p className={styles.emptyHint}>
          Log your first wealth check-in below to see where you stand against your plan.
        </p>
      </Card>
    )
  }

  const netWorth = checkinNetWorthCents(latest, accounts)
  const invested = checkinInvestedCents(latest, accounts)
  const status = activeScenario ? trackStatus(latest, activeScenario, accounts) : null

  return (
    <Card>
      <h3 className={goalStyles.sectionTitle}>Progress snapshot</h3>
      <div className={styles.summaryCardContent}>
        <StatusRow status={status} format={format} />
        <div className={styles.summaryRow}>
          <span>Net worth</span>
          <span className={styles.summaryValue}>{formatMoneyShort(netWorth, format)}</span>
          <span>Investments</span>
          <span className={styles.summaryValue}>{formatMoneyShort(invested, format)}</span>
          {status ? (
            <>
              <span>Plan projection</span>
              <span className={styles.summaryValue}>
                {formatMoneyShort(status.projectedInvestedCents, format)}
              </span>
            </>
          ) : null}
        </div>
        {status && status.deltaMonths !== 0 ? <MonthsHint status={status} /> : null}
      </div>
    </Card>
  )
}
