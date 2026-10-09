import type { GoalScenario, Transaction, WealthAccount, WealthCheckin } from '../../../types'
import type { CashReserve, PortfolioReturn, ReturnReading, TrackStatus } from '../../../engine'
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
  paceMonths,
  plannedMonthlyAt,
  plannedMonthlyAverage,
  readReturn,
  shortMonthFullYearLabel,
  splitGap,
  trackStatus,
  trackVerdict,
} from '../../../engine'
import { formatCheckinDate } from './checkinDate'
import { GapSplitHint } from './GapSplitHint'
import { useAssumedInflation } from '../../hooks/assumedInflationContext'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import type { MoneyFormat } from '../../../engine/money'
import { formatMoneyShort } from './chartTheme'
import { planMoneyLabel } from './planMoneyLabel'
import { planGapLabel } from './planGap'
import { noStatusMessage } from './trackMessages'
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
  /** The emergency-fund target from Assumptions; 0 means none. */
  cashReserveMonths?: number
  /** The budget month still under way, left out of the spending average. */
  openBudgetMonth?: string | undefined
}

/** A yearly return is judged against the plan's only from this many years of history. */
const SETTLED_RETURN_YEARS = 10

/** Within this share of the plan's figure is the same pace: a transfer a few euros short is not behind. */
const PACE_TOLERANCE = 0.98

/**
 * The pace kept since the plan began, against the monthly figure it assumes, over the whole months
 * (the one under way is not a month yet). The mean is the pace; a typical month is named beside it
 * when a one-off lump sum has pulled the mean away from what most months look like, so the two are
 * not confused for each other.
 */
function PaceHint({
  plan,
  transactions,
  openBudgetMonth,
  format,
}: {
  plan: GoalScenario
  transactions: Transaction[]
  openBudgetMonth: string | undefined
  format: MoneyFormat
}) {
  const { months, sincePlanStart } = useMemo(
    () => paceMonths(monthlyFlows(computeMonthlyTotals(transactions)), plan.planStartDate, openBudgetMonth),
    [transactions, plan.planStartDate, openBudgetMonth],
  )
  // The plan's figure over these same months: one amount for a plan that never changes it, and
  // otherwise what it averages, with where it started and where it is now.
  const planned = plannedMonthlyAverage(plan, months.map((m) => m.month))
  if (months.length === 0 || planned <= 0) return null
  const plannedFirst = plannedMonthlyAt(plan, `${months[0]!.month}-15`)
  const plannedNow = plannedMonthlyAt(plan, `${months[months.length - 1]!.month}-15`)
  const invested = months.map((m) => m.investedCents)
  const mean = averageMonthlyCents(invested)
  const median = medianMonthlyCents(invested)
  const onPace = mean >= planned * PACE_TOLERANCE
  // A tenth apart is a lump sum or a pause, not rounding.
  const typical = Math.abs(mean - median) > mean * 0.1 ? median : null
  return (
    <p style={hintStyle}>
      Investing{' '}
      <strong style={{ color: onPace ? 'var(--exp-success)' : 'var(--exp-danger)' }}>
        {formatCents(mean, format)} a month
      </strong>{' '}
      on average over the {months.length} {openBudgetMonth === undefined ? '' : 'full '}month
      {months.length === 1 ? '' : 's'} {sincePlanStart ? 'since the plan started' : 'recorded'}
      {typical !== null ? `, ${formatCents(typical, format)} in a typical month` : ''}, against the{' '}
      {formatCents(planned, format)} a month{plannedFirst === plannedNow ? '' : ' on average'} it assumes
      {plannedFirst === plannedNow
        ? ''
        : ` (${formatCents(plannedFirst, format)} at first, ${formatCents(plannedNow, format)} now)`}
      .
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

const hintStyle = { fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: 0 } as const

/**
 * Whether being behind is a saving problem or a market one. Under a full year the figure
 * is the period's return and reads "so far"; from a year on it is compounded to a yearly
 * rate, has the assumed inflation taken off, and is set against the plan's real return,
 * the same way on/off track above it deflates the balance before comparing.
 */
function ReturnHint({
  reading,
  plan,
  format,
  inflationRate,
}: {
  reading: ReturnReading
  plan: GoalScenario | null
  format: MoneyFormat
  inflationRate: number
}) {
  const since = formatCheckinDate(reading.ret.startDate)
  if (reading.kind !== 'figure') {
    return <UnrecordedHint kind={reading.kind} plan={plan} ret={reading.ret} since={since} format={format} />
  }
  return <FigureHint ret={reading.ret} plan={plan} since={since} format={format} inflationRate={inflationRate} />
}

function FigureHint({
  ret,
  plan,
  since,
  format,
  inflationRate,
}: {
  ret: PortfolioReturn
  plan: GoalScenario | null
  since: string
  format: MoneyFormat
  inflationRate: number
}) {
  const planRate = plan ? `${formatPercent(plan.expectedRealReturn, format)} a year` : ''
  if (ret.annualised === null) {
    // What is measured is a total over under a year, in the money of the day, and the plan's rate is
    // a yearly one after inflation: set side by side they read as ahead whatever the plan expects, so
    // the plan is stated for the same stretch.
    const expected = plan ? Math.pow((1 + plan.expectedRealReturn) * (1 + inflationRate), ret.years) - 1 : null
    return (
      <p style={hintStyle}>
        Your portfolio has returned <strong>{formatPercent(ret.periodReturn, format)} so far</strong>{' '}
        since {since}
        {plan && expected !== null
          ? `, where ${plan.name} assumes about ${formatPercent(expected, format)} over the same days (${planRate} after inflation, with ${formatPercent(inflationRate, format)} inflation)`
          : ''}
        .
      </p>
    )
  }
  const real = (1 + ret.annualised) / (1 + inflationRate) - 1
  // Under ten years a yearly return is mostly the market's luck: at 17% volatility its standard
  // error is about 12 points after two years and still 5 after ten, so a colour would say ahead or
  // behind where the figure cannot tell. It is shown plain, with that said.
  const settled = ret.years >= SETTLED_RETURN_YEARS
  const onPar = !plan || real >= plan.expectedRealReturn
  return (
    <p style={hintStyle}>
      Your portfolio returned{' '}
      <strong style={settled ? { color: onPar ? 'var(--exp-success)' : 'var(--exp-danger)' } : undefined}>
        {formatPercent(ret.annualised, format)} a year
      </strong>{' '}
      since {since}, about {formatPercent(real, format)} once{' '}
      {formatPercent(inflationRate, format)} inflation is taken off
      {plan ? ` against the ${planRate}, after inflation, that ${plan.name} assumes` : ''}.
      {plan && !settled ? ` A few years of returns say little about a long-run ${planRate}.` : ''}
    </p>
  )
}

/**
 * What is said in place of a return that cannot be believed: the balance grew by money that no
 * investment transaction records, which a return would count as growth. Two ways to see it, and the
 * same fix: record the transfers.
 */
function UnrecordedHint({
  kind,
  plan,
  ret,
  since,
  format,
}: {
  kind: 'no-investments' | 'too-high'
  plan: GoalScenario | null
  ret: PortfolioReturn
  since: string
  format: MoneyFormat
}) {
  const fix = 'Add what you moved in as Investment transactions to see the return.'
  if (kind === 'no-investments') {
    const monthly = plan ? formatCents(plannedMonthlyAt(plan, ret.endDate), format) : ''
    return (
      <p style={hintStyle}>
        {plan ? `${plan.name} expects ${monthly} a month, but ` : ''}no investments are recorded since {since}, so
        the balance may include money you moved in, which a return would count as growth. {fix}
      </p>
    )
  }
  return (
    <p style={hintStyle}>
      Your balance has grown by more than 30% a year since {since}. That is more than markets give, and usually money
      you moved in that is not recorded as an investment. {fix}
    </p>
  )
}

function StatusRow({
  status,
  plan,
  latestDate,
  format,
}: {
  status: TrackStatus | null
  plan: GoalScenario | null
  latestDate: string
  format: MoneyFormat
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
  // Within a month either way is on track, which is not red or green for the side it is on.
  const good = verdict !== 'behind'
  return (
    <div className={styles.summaryStatus}>
      <span
        className={[
          styles.statusDot,
          good ? styles.statusDotAhead : styles.statusDotBehind,
        ].join(' ')}
      />
      <span>
        {STATUS_WORDS[verdict]}{' '}
        <span
          className={[
            styles.summaryDelta,
            good ? styles.summaryDeltaAhead : styles.summaryDeltaBehind,
          ].join(' ')}
        >
          ({ahead ? '+' : ''}{formatMoneyShort(status.deltaCents, format)})
        </span>
        {planName ? <span className={styles.summaryPlanName}> · measured against {planName}</span> : null}
      </span>
    </div>
  )
}

const STATUS_WORDS = { 'on-track': 'On track', ahead: 'Ahead of plan', behind: 'Behind plan' } as const

/** Where the plan's line has the balance, said as months and the month it falls in. */
function MonthsHint({ months, planDate }: { months: number; planDate: string }) {
  const ahead = months > 0
  return (
    <p style={hintStyle}>
      <strong style={{ color: ahead ? 'var(--exp-success)' : 'var(--exp-danger)' }}>{planGapLabel(months)}</strong>
      {ahead ? ' of the plan, which only reaches' : ' the plan, which already had'} this balance around{' '}
      {shortMonthFullYearLabel(planDate.slice(0, 7))}.
    </p>
  )
}

/** Said when the balance is read against the other side of a step within a month of it. */
function NearStepHint({ nearStep }: { nearStep: NonNullable<TrackStatus['nearStep']> }) {
  return (
    <p style={hintStyle}>
      The plan&apos;s house purchase or one-off event falls on {formatCheckinDate(nearStep.date)}, within a month of
      this check-in, so your balance is read against the plan with it {nearStep.counted === 'made' ? 'already made' : 'not yet made'}.
    </p>
  )
}

/**
 * How far along the line the balance is, when it is not on track: in months and the month the line
 * has it, or, where the line only has it on the other side of a house purchase or a one-off event,
 * why there are no months.
 */
function PlanGapHint({ status }: { status: TrackStatus }) {
  if (status.nearStep) return <NearStepHint nearStep={status.nearStep} />
  if (status.onTrack) return null
  if (status.deltaMonths && status.planDate) return <MonthsHint months={status.deltaMonths} planDate={status.planDate} />
  if (status.monthsReason !== 'across-event') return null
  return (
    <p style={hintStyle}>
      Months are not counted across a house purchase or a one-off event: the plan&apos;s line steps there, so
      only the gap in euros is shown.
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
  const reading = readReturn(checkins, accounts, transactions, plan)
  const gap = plan && status ? splitGap(plan, checkins, accounts, transactions, inflationRate) : null
  const reserve = cashReserve(latest, accounts, transactions, cashReserveMonths, openBudgetMonth)
  return (
    <>
      {status ? <PlanGapHint status={status} /> : null}
      {gap ? <GapSplitHint reading={gap} planStartDate={plan?.planStartDate ?? null} format={format} onRebaseline={onRebaseline} /> : null}
      {plan ? <PaceHint plan={plan} transactions={transactions} openBudgetMonth={openBudgetMonth} format={format} /> : null}
      {reading ? <ReturnHint reading={reading} plan={plan} format={format} inflationRate={inflationRate} /> : null}
      {reserve ? <CashReserveHint reserve={reserve} format={format} /> : null}
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
  const status = plan ? trackStatus(latest, plan, accounts, inflationRate) : null

  return (
    <Card>
      <h3 className={goalStyles.sectionTitle}>Progress snapshot</h3>
      <div className={styles.summaryCardContent}>
        <StatusRow status={status} plan={plan} latestDate={latest.checkinDate} format={format} />
        <div className={styles.summaryRow}>
          <span>Net worth, all accounts</span>
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
