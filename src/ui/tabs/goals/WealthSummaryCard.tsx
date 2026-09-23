import type { GoalScenario, Transaction, WealthAccount, WealthCheckin } from '../../../types'
import type { PortfolioReturn, TrackStatus } from '../../../engine'
import { Card } from '../../components/primitives'
import {
  checkinInvestedCents,
  checkinNetWorthCents,
  formatPercent,
  latestCheckin,
  portfolioReturn,
  trackStatus,
} from '../../../engine'
import { formatCheckinDate } from './checkinDate'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import type { MoneyFormat } from '../../../engine/money'
import { formatMoneyShort } from './chartTheme'
import { contributionGapLabel } from './contributionGap'
import styles from './progress.module.css'
import goalStyles from './goals.module.css'

interface Props {
  checkins: WealthCheckin[]
  accounts: WealthAccount[]
  plan: GoalScenario | null
  /** Investment transactions are the contributions taken out of the measured return. */
  transactions?: Transaction[]
}

const hintStyle = { fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: 0 } as const

/**
 * Whether being behind is a saving problem or a market one. Under a full year the figure
 * is the period's return and reads "so far"; from a year on it is compounded to a yearly
 * rate and set against the plan's assumption, which is a real return, so a nominal figure
 * a little above it is roughly on par.
 */
function ReturnHint({
  ret,
  plan,
  format,
}: {
  ret: PortfolioReturn
  plan: GoalScenario | null
  format: MoneyFormat
}) {
  const since = formatCheckinDate(ret.startDate)
  const assumed = plan
    ? ` against the ${formatPercent(plan.expectedRealReturn, format)} a year, after inflation, that ${plan.name} assumes`
    : ''
  if (ret.annualised === null) {
    return (
      <p style={hintStyle}>
        Your portfolio has returned <strong>{formatPercent(ret.periodReturn, format)} so far</strong>{' '}
        since {since}{assumed}.
      </p>
    )
  }
  const onPar = !plan || ret.annualised >= plan.expectedRealReturn
  return (
    <p style={hintStyle}>
      Your portfolio returned{' '}
      <strong style={{ color: onPar ? 'var(--exp-success)' : 'var(--exp-danger)' }}>
        {formatPercent(ret.annualised, format)} a year
      </strong>{' '}
      since {since}{assumed}.
    </p>
  )
}

function StatusRow({
  status,
  plan,
  format,
}: {
  status: TrackStatus | null
  plan: GoalScenario | null
  format: MoneyFormat
}) {
  if (!status) {
    // Two different gaps: no plan at all, or a plan the projection cannot be dated
    // against. Telling the second user to go choose a plan sends them the wrong way.
    const why = !plan
      ? 'No plan chosen yet. Open a scenario under Plan and choose Use as my plan.'
      : `${plan.name} has no start date yet. Set one under Plan tracking, or re-baseline it from this check-in, to see whether you are ahead or behind.`
    return (
      <div className={styles.summaryStatus}>
        <span className={[styles.statusDot, styles.statusDotNeutral].join(' ')} />
        <span>{why}</span>
      </div>
    )
  }
  const planName = plan?.name ?? null
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
        {planName ? <span className={styles.summaryPlanName}> · measured against {planName}</span> : null}
      </span>
    </div>
  )
}

function MonthsHint({ status }: { status: TrackStatus }) {
  const ahead = status.deltaCents >= 0
  return (
    <p style={hintStyle}>
      Equivalent to being{' '}
      <strong style={{ color: ahead ? 'var(--exp-success)' : 'var(--exp-danger)' }}>
        {contributionGapLabel(status.deltaMonths)}
      </strong>{' '}
      on contributions.
    </p>
  )
}

export function WealthSummaryCard({ checkins, accounts, plan, transactions = [] }: Props) {
  const format = useMoneyFormat()
  const latest = latestCheckin(checkins)
  const ret = portfolioReturn(checkins, accounts, transactions)

  if (!latest) {
    // A check-in needs an account to record, so without one the first step is Setup.
    const hasAccounts = accounts.some((a) => !a.archived)
    return (
      <Card>
        <h3 className={goalStyles.sectionTitle}>Progress snapshot</h3>
        <p className={styles.emptyHint}>
          {hasAccounts
            ? 'Log your first wealth check-in below to see where you stand against your plan.'
            : 'Name the accounts you track under Setup, then log a check-in to see where you stand against your plan.'}
        </p>
      </Card>
    )
  }

  const netWorth = checkinNetWorthCents(latest, accounts)
  const invested = checkinInvestedCents(latest, accounts)
  const status = plan ? trackStatus(latest, plan, accounts) : null

  return (
    <Card>
      <h3 className={goalStyles.sectionTitle}>Progress snapshot</h3>
      <div className={styles.summaryCardContent}>
        <StatusRow status={status} plan={plan} format={format} />
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
        {ret ? <ReturnHint ret={ret} plan={plan} format={format} /> : null}
      </div>
    </Card>
  )
}
