import { useMemo } from 'react'
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
}: {
  label: string
  hint: string
  value: React.ReactNode
}) {
  return (
    <div className={styles.row}>
      <span className={styles.labelGroup}>
        <span className={styles.label}>{label}</span>
        <span className={styles.hint}>{hint}</span>
      </span>
      <span className={styles.value}>{value}</span>
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

  const perMonth = `${formatCents(metrics.avgMonthlySavingsCents)}/mo`
  const returnPct = formatPercent(goalInputs.expectedRealReturn)
  const compoundNote = `Compounds annually at ${returnPct} real return`
  const downPaymentHint =
    metrics.monthsToDownPayment === 0
      ? `${formatCents(metrics.downPaymentCents)} target already saved`
      : `Saving ${perMonth} toward a ${formatCents(metrics.downPaymentCents)} deposit`

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
          hint={`${compoundNote}; investing ${perMonth} toward ${formatCents(metrics.longTermTargetCents)}`}
          value={formatYears(metrics.yearsToLongTermGoal)}
        />
        <GoalRow
          label="Projected surplus"
          hint={`In ${goalInputs.horizonYears} years vs target · projected ${formatCents(
            metrics.projectedPortfolioCents,
          )}`}
          value={<Money cents={metrics.surplusCents} signed className={styles.value} />}
        />
        <div className={styles.assumption}>
          <span className={styles.assumptionLabel}>Expected real return</span>
          <PercentStepper
            value={goalInputs.expectedRealReturn}
            onChange={onReturnChange}
          />
        </div>
        <p className={styles.footer}>
          {compoundNote}. Surplus is projected portfolio minus your long-term target after{' '}
          {goalInputs.horizonYears} years of saving at your average net saving rate.
        </p>
      </Card>
    </>
  )
}
