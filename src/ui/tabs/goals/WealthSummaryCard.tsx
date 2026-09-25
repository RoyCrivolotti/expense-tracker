import type { GoalScenario, Transaction, WealthAccount, WealthCheckin } from '../../../types'
import type { CashReserve, PortfolioReturn, SteadyGap, TrackStatus } from '../../../engine'
import { useMemo } from 'react'
import { Card } from '../../components/primitives'
import {
  averageMonthlyCents,
  cashReserve,
  checkinInvestedCents,
  checkinNetWorthCents,
  computeMonthlyTotals,
  formatCents,
  formatPercent,
  latestCheckin,
  medianMonthlyCents,
  monthlyFlows,
  monthsSincePlanStart,
  portfolioReturn,
  steadyGap,
  trackStatus,
} from '../../../engine'
import { formatCheckinDate } from './checkinDate'
import { useAssumedInflation } from '../../hooks/assumedInflationContext'
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
  /** Re-baselines the plan from the latest check-in; absent in a read-only session. */
  onRebaseline?: (() => void) | undefined
  /** The emergency-fund target from Setup; 0 means none. */
  cashReserveMonths?: number
  /** The budget month still under way, left out of the spending average. */
  openBudgetMonth?: string | undefined
}

/**
 * The pace kept since the plan began, against the monthly figure it assumes. The mean is
 * the pace; a typical month is named beside it when a one-off lump sum has pulled the
 * mean away from what most months look like, so the two are not confused for each other.
 */
function PaceHint({
  plan,
  transactions,
  format,
}: {
  plan: GoalScenario
  transactions: Transaction[]
  format: MoneyFormat
}) {
  const months = useMemo(
    () => monthsSincePlanStart(monthlyFlows(computeMonthlyTotals(transactions)), plan.planStartDate),
    [transactions, plan.planStartDate],
  )
  if (months.length === 0 || plan.monthlyContributionCents <= 0) return null
  const invested = months.map((m) => m.investedCents)
  const mean = averageMonthlyCents(invested)
  const median = medianMonthlyCents(invested)
  const onPace = mean >= plan.monthlyContributionCents
  // A tenth apart is a lump sum or a pause, not rounding.
  const typical = Math.abs(mean - median) > mean * 0.1 ? median : null
  return (
    <p style={hintStyle}>
      Investing{' '}
      <strong style={{ color: onPace ? 'var(--exp-success)' : 'var(--exp-danger)' }}>
        {formatCents(mean, format)} a month
      </strong>{' '}
      on average over the {months.length} month{months.length === 1 ? '' : 's'} since the plan started
      {typical !== null ? `, ${formatCents(typical, format)} in a typical month` : ''}, against the{' '}
      {formatCents(plan.monthlyContributionCents, format)} a month it assumes.
    </p>
  )
}

/** Cash as months of spending, against the target when there is one. */
function CashReserveHint({ reserve, format }: { reserve: CashReserve; format: MoneyFormat }) {
  const cash = formatMoneyShort(reserve.cashCents, format)
  if (reserve.monthsCovered === null) {
    return <p style={hintStyle}>Cash reserve: <strong>{cash}</strong>.</p>
  }
  const months = reserve.monthsCovered.toFixed(1)
  // Judged on the figure shown: 5.96 reads "6.0", and "6.0 months" in red against a
  // target of 6 would look like a rounding error, which is what it would be.
  const shown = Number(months)
  if (reserve.targetMonths <= 0) {
    return (
      <p style={hintStyle}>
        Cash reserve: <strong>{cash}</strong>, about {months} months of spending.
      </p>
    )
  }
  const met = shown >= reserve.targetMonths
  return (
    <p style={hintStyle}>
      Cash reserve: <strong>{cash}</strong> covers{' '}
      <strong style={{ color: met ? 'var(--exp-success)' : 'var(--exp-danger)' }}>
        {months} months
      </strong>{' '}
      of spending, against a target of {reserve.targetMonths} months.
    </p>
  )
}

/**
 * A gap that has held still for half a year is the plan's starting point being wrong,
 * not the saving. Said once, with the fix to hand, rather than left as a red number.
 */
function SteadyGapHint({
  gap,
  format,
  onRebaseline,
}: {
  gap: SteadyGap
  format: MoneyFormat
  onRebaseline: (() => void) | undefined
}) {
  const behind = gap.meanDeltaCents < 0
  return (
    <div className={styles.steadyGap}>
      <p style={hintStyle}>
        Every check-in since {formatCheckinDate(gap.sinceDate)} has sat about{' '}
        {formatMoneyShort(Math.abs(gap.meanDeltaCents), format)} {behind ? 'behind' : 'ahead'}. A gap
        that does not move is the plan's starting point, not your saving. Re-baselining sets the
        plan's start to the latest check-in, so from here on ahead or behind measures only what
        you do next.
      </p>
      {onRebaseline ? (
        <button type="button" className={goalStyles.btn} onClick={onRebaseline}>
          Re-baseline from latest check-in
        </button>
      ) : null}
    </div>
  )
}

const hintStyle = { fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: 0 } as const

/**
 * Whether being behind is a saving problem or a market one. Under a full year the figure
 * is the period's return and reads "so far"; from a year on it is compounded to a yearly
 * rate, has the assumed inflation taken off, and is set against the plan's real return,
 * the same way on/off track above it deflates the balance before comparing.
 */
function ReturnHint({
  ret,
  plan,
  format,
  inflationRate,
}: {
  ret: PortfolioReturn
  plan: GoalScenario | null
  format: MoneyFormat
  inflationRate: number
}) {
  const since = formatCheckinDate(ret.startDate)
  const planRate = plan ? `${formatPercent(plan.expectedRealReturn, format)} a year` : ''
  if (ret.annualised === null) {
    return (
      <p style={hintStyle}>
        Your portfolio has returned <strong>{formatPercent(ret.periodReturn, format)} so far</strong>{' '}
        since {since}
        {plan ? ` against the ${planRate} that ${plan.name} assumes` : ''}.
      </p>
    )
  }
  const real = (1 + ret.annualised) / (1 + inflationRate) - 1
  const onPar = !plan || real >= plan.expectedRealReturn
  return (
    <p style={hintStyle}>
      Your portfolio returned{' '}
      <strong style={{ color: onPar ? 'var(--exp-success)' : 'var(--exp-danger)' }}>
        {formatPercent(ret.annualised, format)} a year
      </strong>{' '}
      since {since}, about {formatPercent(real, format)} once{' '}
      {formatPercent(inflationRate, format)} inflation is taken off
      {plan ? ` against the ${planRate}, after inflation, that ${plan.name} assumes` : ''}.
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

/** The lines under the figures: each one earns its place only when it has something to say. */
function SnapshotHints({
  latest,
  status,
  checkins,
  accounts,
  plan,
  transactions,
  cashReserveMonths,
  openBudgetMonth,
  onRebaseline,
  format,
}: Required<Pick<Props, 'checkins' | 'accounts' | 'plan' | 'transactions' | 'cashReserveMonths'>> & {
  openBudgetMonth: string | undefined
  latest: WealthCheckin
  status: TrackStatus | null
  onRebaseline: (() => void) | undefined
  format: MoneyFormat
}) {
  const inflationRate = useAssumedInflation()
  const ret = portfolioReturn(checkins, accounts, transactions)
  const stale = plan ? steadyGap(checkins, plan, accounts, inflationRate) : null
  const reserve = cashReserve(latest, accounts, transactions, cashReserveMonths, openBudgetMonth)
  return (
    <>
      {status && status.deltaMonths !== 0 ? <MonthsHint status={status} /> : null}
      {plan ? <PaceHint plan={plan} transactions={transactions} format={format} /> : null}
      {ret ? <ReturnHint ret={ret} plan={plan} format={format} inflationRate={inflationRate} /> : null}
      {reserve ? <CashReserveHint reserve={reserve} format={format} /> : null}
      {stale ? <SteadyGapHint gap={stale} format={format} onRebaseline={onRebaseline} /> : null}
    </>
  )
}

export function WealthSummaryCard({
  checkins,
  accounts,
  plan,
  transactions = [],
  onRebaseline,
  cashReserveMonths = 0,
  openBudgetMonth,
}: Props) {
  const format = useMoneyFormat()
  const inflationRate = useAssumedInflation()
  const latest = latestCheckin(checkins)

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
  const status = plan ? trackStatus(latest, plan, accounts, inflationRate) : null

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
        <SnapshotHints
          latest={latest}
          status={status}
          checkins={checkins}
          accounts={accounts}
          plan={plan}
          transactions={transactions}
          cashReserveMonths={cashReserveMonths}
          openBudgetMonth={openBudgetMonth}
          onRebaseline={onRebaseline}
          format={format}
        />
      </div>
    </Card>
  )
}
