import { useMemo } from 'react'
import type { ExpenseDataset } from '../../types'
import {
  averageMonthlyCents,
  computeMonthlyTotals,
  defaultBudgetMonth,
  latestCheckin,
  checkinInvestedCents,
  planFromToday,
  monthlyFlows,
  paceMonths,
  plannedMonthlyAverage,
  trackStatus,
  trackVerdict,
  type TrackStatus,
} from '../../engine'
import { Card, EmptyState, SectionTitle } from './primitives'
import { scenarioHeadline } from '../tabs/goals/scenarioHeadline'
import { activePlan } from '../tabs/goals/scenarioSelection'
import { useAssumedInflation } from '../hooks/assumedInflationContext'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { formatMoneyShort } from '../tabs/goals/chartTheme'
import { planGapLabel } from '../tabs/goals/planGap'
import { daysSinceCheckin } from './checkinAge'
import { todayIso } from './transactionFormState'
import styles from './GoalsCard.module.css'

interface GoalsCardProps {
  dataset: ExpenseDataset
  onOpenGoals?: () => void
  /** Opens Goals on Progress with the check-in form up; absent when nothing can be written. */
  onLogCheckin?: (() => void) | undefined
}

/** Check-ins are monthly by design; a month without one is worth a word. */
const NUDGE_AFTER_DAYS = 30

/**
 * Manual check-ins die of neglect, and nothing else in the app asks for one. Shown once
 * there is an account to log against and the last check-in is a month old, or missing.
 */
function CheckinNudge({ dataset, onLogCheckin }: { dataset: ExpenseDataset; onLogCheckin: () => void }) {
  if (!dataset.wealthAccounts.some((a) => !a.archived)) return null
  const days = daysSinceCheckin(dataset)
  if (days !== null && days < NUDGE_AFTER_DAYS) return null
  const text = days === null ? 'No check-in logged yet.' : `Last check-in ${days} days ago.`
  return (
    <p className={styles.nudge}>
      {text}{' '}
      <button type="button" className={styles.openLink} onClick={onLogCheckin}>
        Log check-in
      </button>
    </p>
  )
}

interface TrackBadgeProps {
  status: TrackStatus
  format: ReturnType<typeof useMoneyFormat>
}

function TrackBadge({ status, format }: TrackBadgeProps) {
  const verdict = trackVerdict(status)
  // Within a month either way is on track, which is neither the green nor the red of a side.
  const ahead = verdict !== 'behind'
  const dotClass = `${styles.trackDot} ${ahead ? styles.trackDotAhead : styles.trackDotBehind}`
  const money = formatMoneyShort(Math.abs(status.deltaCents), format)
  // Without a month count the plan's line has no point at this balance on this side of a step, so the gap in money is all there is.
  const label =
    verdict === 'on-track'
      ? 'On track'
      : status.deltaMonths
        ? planGapLabel(status.deltaMonths)
        : `${money} ${verdict}`
  return (
    <div className={`${styles.trackBadge} ${ahead ? styles.trackBadgeAhead : styles.trackBadgeBehind}`}>
      <span className={dotClass} />
      {label}
    </div>
  )
}

export function GoalsCard({ dataset, onOpenGoals, onLogCheckin }: GoalsCardProps) {
  const format = useMoneyFormat()
  const inflationRate = useAssumedInflation()
  const scenario = useMemo(() => activePlan(dataset.goalScenarios), [dataset.goalScenarios])
  // The pace kept since the plan began: investment transactions per month, which is
  // what the plan's monthly figure promises, rather than net saving.
  const { avgInvesting, plannedAverage } = useMemo(() => {
    const flows = monthlyFlows(computeMonthlyTotals(dataset.transactions))
    const { months } = paceMonths(
      flows,
      scenario?.planStartDate ?? null,
      defaultBudgetMonth(todayIso(), dataset.settings.budgetRolloverDay),
    )
    return {
      avgInvesting: averageMonthlyCents(months.map((m) => m.investedCents)),
      // What the plan averages over those same months, which is what the pace is set against.
      plannedAverage: scenario ? plannedMonthlyAverage(scenario, months.map((m) => m.month)) : 0,
    }
  }, [dataset.transactions, dataset.settings.budgetRolloverDay, scenario])
  const fromToday = useMemo(() => {
    const latest = latestCheckin(dataset.wealthCheckins)
    return planFromToday(
      scenario,
      latest ? { investedCents: checkinInvestedCents(latest, dataset.wealthAccounts), date: latest.checkinDate } : null,
    )
  }, [scenario, dataset.wealthCheckins, dataset.wealthAccounts])
  const headline = useMemo(
    () =>
      scenario
        ? scenarioHeadline(scenario, inflationRate, avgInvesting, format, fromToday, {
            today: todayIso(),
            plannedAverageCents: plannedAverage,
          })
        : null,
    [scenario, inflationRate, avgInvesting, plannedAverage, format, fromToday],
  )

  const track = useMemo(() => {
    if (!scenario) return null
    const latest = latestCheckin(dataset.wealthCheckins)
    if (!latest) return null
    return trackStatus(latest, scenario, dataset.wealthAccounts, inflationRate)
  }, [scenario, dataset.wealthCheckins, dataset.wealthAccounts, inflationRate])

  if (!scenario || !headline) {
    return (
      <>
        <SectionTitle>Goals</SectionTitle>
        <Card>
          <EmptyState
            actionLabel={onOpenGoals ? 'Open Goals' : undefined}
            onAction={onOpenGoals}
          >
            {dataset.goalScenarios.length > 0
              ? 'Pick one of your scenarios as your plan under Goals, and this card will track it.'
              : 'Model multi-scenario wealth projections: house purchase timing, FIRE milestones, and net worth over time.'}
          </EmptyState>
        </Card>
      </>
    )
  }

  return (
    <>
      <SectionTitle>
        Goals
        {onOpenGoals ? (
          <>
            {' '}
            <button type="button" className={styles.openLink} onClick={onOpenGoals}>
              View projections
            </button>
          </>
        ) : null}
      </SectionTitle>
      <Card>
        <p className={styles.primary}>{headline.primary}</p>
        <p className={styles.secondary}>{headline.secondary}</p>
        {track ? (
          <TrackBadge status={track} format={format} />
        ) : null}
        {onLogCheckin ? <CheckinNudge dataset={dataset} onLogCheckin={onLogCheckin} /> : null}
        {onOpenGoals ? (
          <button type="button" className={styles.cta} onClick={onOpenGoals}>
            Open Goals
          </button>
        ) : null}
      </Card>
    </>
  )
}
