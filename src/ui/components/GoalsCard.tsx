import { useMemo } from 'react'
import type { ExpenseDataset } from '../../types'
import {
  averageMonthlyCents,
  computeMonthlyTotals,
  latestCheckin,
  monthlyFlows,
  monthsSincePlanStart,
  trackStatus,
} from '../../engine'
import { Card, EmptyState, SectionTitle } from './primitives'
import { scenarioHeadline } from '../tabs/goals/scenarioHeadline'
import { activePlan } from '../tabs/goals/scenarioSelection'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { formatMoneyShort } from '../tabs/goals/chartTheme'
import styles from './GoalsCard.module.css'

interface GoalsCardProps {
  dataset: ExpenseDataset
  onOpenGoals?: () => void
}

interface TrackBadgeProps {
  deltaCents: number
  deltaMonths: number
  format: ReturnType<typeof useMoneyFormat>
}

function TrackBadge({ deltaCents, deltaMonths, format }: TrackBadgeProps) {
  const ahead = deltaCents >= 0
  const dotClass = `${styles.trackDot} ${ahead ? styles.trackDotAhead : styles.trackDotBehind}`
  const label =
    deltaMonths === 0
      ? ahead
        ? 'On track'
        : `${formatMoneyShort(Math.abs(deltaCents), format)} behind`
      : deltaMonths > 0
        ? `${deltaMonths} months ahead`
        : `${Math.abs(deltaMonths)} months behind`
  return (
    <div className={`${styles.trackBadge} ${ahead ? styles.trackBadgeAhead : styles.trackBadgeBehind}`}>
      <span className={dotClass} />
      {label}
    </div>
  )
}

export function GoalsCard({ dataset, onOpenGoals }: GoalsCardProps) {
  const format = useMoneyFormat()
  const scenario = useMemo(() => activePlan(dataset.goalScenarios), [dataset.goalScenarios])
  // The pace kept since the plan began: investment transactions per month, which is
  // what the plan's monthly figure promises, rather than net saving.
  const avgInvesting = useMemo(() => {
    const flows = monthlyFlows(computeMonthlyTotals(dataset.transactions))
    const since = monthsSincePlanStart(flows, scenario?.planStartDate ?? null)
    return averageMonthlyCents(since.map((m) => m.investedCents))
  }, [dataset.transactions, scenario])
  const headline = useMemo(
    () => (scenario ? scenarioHeadline(scenario, avgInvesting, format) : null),
    [scenario, avgInvesting, format],
  )

  const track = useMemo(() => {
    if (!scenario) return null
    const latest = latestCheckin(dataset.wealthCheckins)
    if (!latest) return null
    return trackStatus(latest, scenario, dataset.wealthAccounts)
  }, [scenario, dataset.wealthCheckins, dataset.wealthAccounts])

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
          <TrackBadge deltaCents={track.deltaCents} deltaMonths={track.deltaMonths} format={format} />
        ) : null}
        {onOpenGoals ? (
          <button type="button" className={styles.cta} onClick={onOpenGoals}>
            Open Goals
          </button>
        ) : null}
      </Card>
    </>
  )
}
