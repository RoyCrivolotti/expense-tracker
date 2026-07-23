import { useMemo } from 'react'
import type { ExpenseDataset } from '../../types'
import {
  averageMonthlySaving,
  computeMonthlyTotals,
} from '../../engine'
import { Card, EmptyState, SectionTitle } from './primitives'
import { scenarioHeadline } from '../tabs/goals/scenarioHeadline'
import { resolveDashboardScenario } from '../tabs/goals/scenarioSelection'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import styles from './GoalsCard.module.css'

interface GoalsCardProps {
  dataset: ExpenseDataset
  onOpenGoals?: () => void
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
        {onOpenGoals ? (
          <button type="button" className={styles.cta} onClick={onOpenGoals}>
            Open Goals
          </button>
        ) : null}
      </Card>
    </>
  )
}
