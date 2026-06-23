import { useMemo } from 'react'
import type { ExpenseDataset } from '../../types'
import {
  computeGoals,
  averageMonthlySaving,
  computeMonthlyTotals,
  formatCents,
} from '../../engine'
import { Money } from './Money'
import { Card, SectionTitle } from './primitives'
import { formatMonths, formatYears } from './goalsFormat'
import styles from './GoalsCard.module.css'

interface GoalsCardProps {
  dataset: ExpenseDataset
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

export function GoalsCard({ dataset }: GoalsCardProps) {
  const metrics = useMemo(() => {
    const totals = [...computeMonthlyTotals(dataset.transactions).values()]
    const avgSaving = averageMonthlySaving(totals.map((t) => t.netSavingCents))
    return computeGoals(dataset.goalInputs, avgSaving, dataset.settings.liquidNetWorthCents)
  }, [dataset])

  // Nothing meaningful to show until a house price or long-term target is set.
  if (dataset.goalInputs.housePriceCents === 0 && dataset.goalInputs.longTermTargetCents === 0) {
    return null
  }

  const perMonth = `${formatCents(metrics.avgMonthlySavingsCents)}/mo`
  const downPaymentHint =
    metrics.monthsToDownPayment === 0
      ? `${formatCents(metrics.downPaymentCents)} target already saved`
      : `Saving ${perMonth} toward a ${formatCents(metrics.downPaymentCents)} deposit`

  return (
    <>
      <SectionTitle>Goals</SectionTitle>
      <Card>
        <GoalRow
          label="Time to down payment"
          hint={downPaymentHint}
          value={formatMonths(metrics.monthsToDownPayment)}
        />
        <GoalRow
          label="Time to long-term target"
          hint={`Investing ${perMonth} toward ${formatCents(metrics.longTermTargetCents)}`}
          value={formatYears(metrics.yearsToLongTermGoal)}
        />
        <GoalRow
          label="Projected surplus"
          hint={`In ${dataset.goalInputs.horizonYears} years vs target · projected ${formatCents(
            metrics.projectedPortfolioCents,
          )}`}
          value={<Money cents={metrics.surplusCents} signed className={styles.value} />}
        />
      </Card>
    </>
  )
}
