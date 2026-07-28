import { useMemo } from 'react'
import type { ExpenseDataset } from '../../types'
import {
  averageMonthlySaving,
  computeMonthlyTotals,
  latestCheckin,
  trackStatus,
} from '../../engine'
import { Card, EmptyState, SectionTitle } from './primitives'
import { scenarioHeadline } from '../tabs/goals/scenarioHeadline'
import { resolveDashboardScenario } from '../tabs/goals/scenarioSelection'
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
        ? `${deltaMonths} mo ahead`
        : `${Math.abs(deltaMonths)} mo behind`
  return (
    <div className={`${styles.trackBadge} ${ahead ? styles.trackBadgeAhead : styles.trackBadgeBehind}`}>
      <span className={dotClass} />
      {label}
    </div>
  )
}

export function GoalsCard({ dataset, onOpenGoals }: GoalsCardProps) {
  const format = useMoneyFormat()
  const scenario = useMemo(
    () => resolveDashboardScenario(dataset.goalScenarios),
    [dataset.goalScenarios],
  )
  const avgSaving = useMemo(() => {
    const totals = [...computeMonthlyTotals(dataset.transactions).values()]
    return averageMonthlySaving(totals.map((t) => t.netSavingCents))
  }, [dataset.transactions])
  const headline = useMemo(
    () => (scenario ? scenarioHeadline(scenario, avgSaving, format) : null),
    [scenario, avgSaving, format],
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
            Model multi-scenario wealth projections: house purchase timing, FIRE milestones, and
            net worth over time.
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
