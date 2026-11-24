import type { GoalScenario, Transaction, WealthAccount, WealthCheckin } from '../../../types'
import type { TrackStatus } from '../../../engine'
import { Card } from '../../components/primitives'
import { checkinInvestedCents, checkinNetWorthCents, latestCheckin, trackVerdict } from '../../../engine'
import { useAssumedInflation } from '../../hooks/assumedInflationContext'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import type { MoneyFormat } from '../../../engine/money'
import { formatMoneyShort } from './chartTheme'
import { planMoneyLabel } from './planMoneyLabel'
import { noStatusMessage } from './trackMessages'
import { SnapshotHints } from './SnapshotHints'
import { isBehindFromTheMarket, readStanding } from './wealthStanding'
import styles from './progress.module.css'
import goalStyles from './goals.module.css'

export interface Props {
  checkins: WealthCheckin[]
  accounts: WealthAccount[]
  plan: GoalScenario | null
  /** Investment transactions are the contributions taken out of the measured return. */
  transactions?: Transaction[]
  /** For the pace and the cash reserve, which only add amounts; the transactions when absent. */
  sumTransactions?: Transaction[] | undefined
  /** Re-baselines the plan from the latest check-in; absent in a read-only session. */
  onRebaseline?: (() => void) | undefined
  /** The emergency-fund target from Assumptions; 0 means none. */
  cashReserveMonths?: number
  /** The budget month still under way, left out of the spending average. */
  openBudgetMonth?: string | undefined
}

function StatusRow({
  status,
  plan,
  latestDate,
  format,
  fromTheMarket,
}: {
  status: TrackStatus | null
  plan: GoalScenario | null
  latestDate: string
  format: MoneyFormat
  /** Behind, with the investing at least what the plan asks: the market and the start explain it. */
  fromTheMarket: boolean
}) {
  if (!status) {
    // Different gaps: no plan at all, a plan with no start date, or a plan whose line does not
    // reach the latest check-in. Telling one user the reason of another sends them the wrong way.
    const why = noStatusMessage(plan, latestDate)
    return (
      <div className={styles.summaryStatus}>
        <span className={[styles.statusDot, styles.statusDotNeutral].join(' ')} />
        <span>{why}</span>
      </div>
    )
  }
  const planName = plan?.name ?? null
  const verdict = trackVerdict(status)
  const ahead = status.deltaCents >= 0
  // Within a month either way is on track, which is not red or green for the side it is on. Behind because of
  // the market is a fact and not an alarm: nothing the reader did is what red would ask them to change.
  const good = verdict !== 'behind'
  const dot = fromTheMarket ? styles.statusDotNeutral : good ? styles.statusDotAhead : styles.statusDotBehind
  const delta = fromTheMarket ? styles.summaryDeltaNeutral : good ? styles.summaryDeltaAhead : styles.summaryDeltaBehind
  return (
    <div className={styles.summaryStatus}>
      <span className={[styles.statusDot, dot].join(' ')} />
      <span>
        {STATUS_WORDS[verdict]}{' '}
        <span className={[styles.summaryDelta, delta].join(' ')}>
          ({ahead ? '+' : ''}
          {formatMoneyShort(status.deltaCents, format)})
        </span>
        {fromTheMarket ? <span className={styles.summaryPlanName}> · not from your investing</span> : null}
        {planName ? <span className={styles.summaryPlanName}> · measured against {planName}</span> : null}
      </span>
    </div>
  )
}

const STATUS_WORDS = { 'on-track': 'On track', ahead: 'Ahead of plan', behind: 'Behind plan' } as const

/** The balance as logged and, with a plan to read it against, in the plan's money beside the plan's own figure. */
function SummaryFigures({
  netWorth,
  invested,
  status,
  plan,
  format,
}: {
  netWorth: number
  invested: number
  status: TrackStatus | null
  plan: GoalScenario | null
  format: MoneyFormat
}) {
  return (
    <div className={styles.summaryRow}>
      <span>Net worth, as logged, all accounts</span>
      <span className={styles.summaryValue}>{formatMoneyShort(netWorth, format)}</span>
      {/* With a plan the balance is shown in the plan's euros, beside the plan's own figure, so that taking
          one from the other gives the gap above them. As logged on the account it is in the hover text. */}
      <span>{status ? `Investments, in ${planMoneyLabel(plan?.planStartDate, format)}` : 'Investments'}</span>
      <span
        className={styles.summaryValue}
        title={status ? `As logged on your account: ${formatMoneyShort(invested, format)}` : undefined}
      >
        {formatMoneyShort(status ? status.actualRealInvestedCents : invested, format)}
      </span>
      {status ? (
        <>
          <span>Plan projection, in {planMoneyLabel(plan?.planStartDate, format)}</span>
          <span className={styles.summaryValue}>{formatMoneyShort(status.projectedInvestedCents, format)}</span>
        </>
      ) : null}
    </div>
  )
}

export function WealthSummaryCard({
  checkins,
  accounts,
  plan,
  transactions = [],
  sumTransactions = transactions,
  onRebaseline,
  cashReserveMonths = 0,
  openBudgetMonth,
}: Props) {
  const format = useMoneyFormat()
  const inflationRate = useAssumedInflation()
  const latest = latestCheckin(checkins)

  if (!latest) {
    // A check-in needs an account to record, so without one the first step is Assumptions.
    const hasAccounts = accounts.some((a) => !a.archived)
    return (
      <Card>
        <h3 className={goalStyles.sectionTitle}>Progress snapshot</h3>
        <p className={styles.emptyHint}>
          {hasAccounts
            ? 'Log your first wealth check-in below to see where you stand against your plan.'
            : 'Set up accounts in Assumptions, then log a check-in to see where you stand against your plan.'}
        </p>
      </Card>
    )
  }

  const netWorth = checkinNetWorthCents(latest, accounts)
  const invested = checkinInvestedCents(latest, accounts)
  const { status, gap } = readStanding(latest, checkins, accounts, plan, transactions, inflationRate)

  return (
    <Card>
      <h3 className={goalStyles.sectionTitle}>Progress snapshot</h3>
      <div className={styles.summaryCardContent}>
        <StatusRow
          status={status}
          plan={plan}
          latestDate={latest.checkinDate}
          format={format}
          fromTheMarket={isBehindFromTheMarket(gap)}
        />
        <SummaryFigures netWorth={netWorth} invested={invested} status={status} plan={plan} format={format} />
        <SnapshotHints
          latest={latest}
          status={status}
          gap={gap}
          checkins={checkins}
          accounts={accounts}
          plan={plan}
          transactions={transactions}
          sumTransactions={sumTransactions}
          cashReserveMonths={cashReserveMonths}
          openBudgetMonth={openBudgetMonth}
          onRebaseline={onRebaseline}
          format={format}
        />
      </div>
    </Card>
  )
}
