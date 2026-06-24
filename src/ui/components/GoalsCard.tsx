import { useMemo, type ReactNode } from 'react'
import type { ExpenseDataset } from '../../types'
import type { ExpenseActions } from '../actions'
import {
  computeGoals,
  averageMonthlySaving,
  computeMonthlyTotals,
  formatCents,
  formatPercent,
} from '../../engine'
import { Money } from './Money'
import { PercentStepper } from './PercentStepper'
import { Card, SectionTitle } from './primitives'
import { formatMonths, formatYears } from './goalsFormat'
import styles from './GoalsCard.module.css'

interface GoalsCardProps {
  dataset: ExpenseDataset
  actions?: ExpenseActions | undefined
  onOpenGoals?: () => void
}

function GoalRow({
  label,
  hint,
  value,
  valueClassName,
}: {
  label: string
  hint: string
  value: ReactNode
  valueClassName?: string
}) {
  return (
    <div className={styles.row}>
      <span className={styles.labelGroup}>
        <span className={styles.label}>{label}</span>
        <span className={styles.hint}>{hint}</span>
      </span>
      <span className={valueClassName ?? styles.value}>{value}</span>
    </div>
  )
}

export function GoalsCard({ dataset, actions, onOpenGoals }: GoalsCardProps) {
  const { goalInputs } = dataset
  const metrics = useMemo(() => {
    const totals = [...computeMonthlyTotals(dataset.transactions).values()]
    const avgSaving = averageMonthlySaving(totals.map((t) => t.netSavingCents))
    return computeGoals(goalInputs, avgSaving, dataset.settings.liquidNetWorthCents)
  }, [dataset, goalInputs])

  if (goalInputs.housePriceCents === 0 && goalInputs.longTermTargetCents === 0) {
    return null
  }

  const perMonth = formatCents(metrics.avgMonthlySavingsCents)
  const returnPct = formatPercent(goalInputs.expectedRealReturn)
  const downPaymentHint =
    metrics.monthsToDownPayment === 0
      ? 'Deposit target already covered'
      : `${perMonth}/mo toward ${formatCents(metrics.downPaymentCents)} deposit`

  const onReturnChange = actions
    ? (fraction: number) => void actions.updateGoals({ expectedRealReturn: fraction })
    : undefined

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
        <GoalRow
          label="Time to down payment"
          hint={downPaymentHint}
          value={formatMonths(metrics.monthsToDownPayment)}
        />
        <GoalRow
          label="Time to long-term target"
          hint={`${returnPct} real · ${perMonth}/mo · target ${formatCents(metrics.longTermTargetCents)}`}
          value={formatYears(metrics.yearsToLongTermGoal)}
        />
        <GoalRow
          label="Projected surplus"
          hint={`${goalInputs.horizonYears}yr horizon · portfolio ${formatCents(metrics.projectedPortfolioCents)}`}
          value={<Money cents={metrics.surplusCents} signed className={styles.value} />}
          valueClassName={`${styles.value} ${styles.valueSurplus}`}
        />
        <div className={styles.assumption}>
          <span className={styles.assumptionLabel}>Expected real return</span>
          <PercentStepper value={goalInputs.expectedRealReturn} onChange={onReturnChange} />
        </div>
        <p className={styles.footer}>
          Surplus = projected portfolio minus long-term target after {goalInputs.horizonYears} years
          at your average net saving rate.
        </p>
      </Card>
    </>
  )
}
