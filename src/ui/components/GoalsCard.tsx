import { useMemo } from 'react'
import type { ExpenseDataset } from '../../types'
import { computeGoals, averageMonthlySaving, computeMonthlyTotals } from '../../engine'
import { Money } from './Money'
import { Card, SectionTitle } from './primitives'
import { formatMonths, formatYears } from './goalsFormat'
import styles from './GoalsCard.module.css'

interface GoalsCardProps {
  dataset: ExpenseDataset
}

function GoalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
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

  return (
    <>
      <SectionTitle>Goals</SectionTitle>
      <Card>
        <GoalRow label="Down payment" value={formatMonths(metrics.monthsToDownPayment)} />
        <GoalRow label="Long-term target" value={formatYears(metrics.yearsToLongTermGoal)} />
        <div className={styles.row}>
          <span className={styles.label}>Projected surplus</span>
          <Money cents={metrics.surplusCents} signed className={styles.value} />
        </div>
      </Card>
    </>
  )
}
