import type { GoalScenario, Transaction, WealthCheckin } from '../../../types'
import type { CashReserve, TrackStatus } from '../../../engine'
import { useMemo } from 'react'
import {
  averageMonthlyCents,
  cashReserve,
  computeMonthlyTotals,
  formatCents,
  type GapReading,
  medianMonthlyCents,
  monthlyFlows,
  paceMonths,
  plannedMonthlyAt,
  plannedMonthlyAverage,
  readReturn,
  shortMonthFullYearLabel,
} from '../../../engine'
import { formatCheckinDate } from './checkinDate'
import { GapSplitHint } from './GapSplitHint'
import { useAssumedInflation } from '../../hooks/assumedInflationContext'
import type { MoneyFormat } from '../../../engine/money'
import { formatMoneyShort } from './chartTheme'
import { planGapLabel } from './planGap'
import { ReturnHint } from './ReturnHint'
import { hintStyle } from './hintStyle'
import { isBehindFromTheMarket } from './wealthStanding'
import type { Props } from './WealthSummaryCard'

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
  sumTransactions,
  openBudgetMonth,
  format,
}: {
  plan: GoalScenario
  sumTransactions: Transaction[]
  openBudgetMonth: string | undefined
  format: MoneyFormat
}) {
  const { months, sincePlanStart } = useMemo(
    () => paceMonths(monthlyFlows(computeMonthlyTotals(sumTransactions)), plan.planStartDate, openBudgetMonth),
    [sumTransactions, plan.planStartDate, openBudgetMonth],
  )
  // The plan's figure over these same months: one amount for a plan that never changes it, and
  // otherwise what it averages, with where it started and where it is now.
  const planned = plannedMonthlyAverage(
    plan,
    months.map((m) => m.month),
  )
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
    return (
      <p style={hintStyle}>
        Cash reserve: <strong>{cash}</strong>.
      </p>
    )
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
      <strong style={{ color: met ? 'var(--exp-success)' : 'var(--exp-danger)' }}>{months} months</strong> of spending,
      against a target of {reserve.targetMonths} months.
    </p>
  )
}

/** Where the plan's line has the balance, said as months and the month it falls in. */
function MonthsHint({ months, planDate, muted }: { months: number; planDate: string; muted: boolean }) {
  const ahead = months > 0
  const color = ahead ? 'var(--exp-success)' : muted ? 'var(--color-text-muted)' : 'var(--exp-danger)'
  return (
    <p style={hintStyle}>
      <strong style={{ color }}>{planGapLabel(months)}</strong>
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
      this check-in, so your balance is read against the plan with it{' '}
      {nearStep.counted === 'made' ? 'already made' : 'not yet made'}.
    </p>
  )
}

/**
 * How far along the line the balance is, when it is not on track: in months and the month the line
 * has it, or, where the line only has it on the other side of a house purchase or a one-off event,
 * why there are no months.
 */
function PlanGapHint({ status, fromTheMarket }: { status: TrackStatus; fromTheMarket: boolean }) {
  if (status.nearStep) return <NearStepHint nearStep={status.nearStep} />
  if (status.onTrack) return null
  if (status.deltaMonths && status.planDate)
    return <MonthsHint months={status.deltaMonths} planDate={status.planDate} muted={fromTheMarket} />
  if (status.monthsReason !== 'across-event') return null
  return (
    <p style={hintStyle}>
      Months are not counted across a house purchase or a one-off event: the plan&apos;s line steps there, so only the
      gap is shown.
    </p>
  )
}

/** The lines under the figures: each one earns its place only when it has something to say. */
export function SnapshotHints({
  latest,
  status,
  gap,
  checkins,
  accounts,
  plan,
  transactions,
  sumTransactions,
  cashReserveMonths,
  openBudgetMonth,
  onRebaseline,
  format,
}: Required<Pick<Props, 'checkins' | 'accounts' | 'plan' | 'transactions' | 'cashReserveMonths'>> & {
  sumTransactions: Transaction[]
  openBudgetMonth: string | undefined
  latest: WealthCheckin
  status: TrackStatus | null
  gap: GapReading | null
  onRebaseline: (() => void) | undefined
  format: MoneyFormat
}) {
  const inflationRate = useAssumedInflation()
  const reading = readReturn(checkins, accounts, transactions, plan)
  const reserve = cashReserve(latest, accounts, sumTransactions, cashReserveMonths, openBudgetMonth)
  return (
    <>
      {status ? <PlanGapHint status={status} fromTheMarket={isBehindFromTheMarket(gap)} /> : null}
      {gap ? (
        <GapSplitHint
          reading={gap}
          planStartDate={plan?.planStartDate ?? null}
          format={format}
          onRebaseline={onRebaseline}
        />
      ) : null}
      {plan ? (
        <PaceHint plan={plan} sumTransactions={sumTransactions} openBudgetMonth={openBudgetMonth} format={format} />
      ) : null}
      {reading ? <ReturnHint reading={reading} plan={plan} format={format} inflationRate={inflationRate} /> : null}
      {reserve ? <CashReserveHint reserve={reserve} format={format} /> : null}
    </>
  )
}
