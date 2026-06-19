import { useMemo } from 'react'
import type { ExpenseModel } from '../../useExpenseData'
import { computeBudgetHealth } from '../../../engine'
import { MonthPicker } from '../../components/MonthPicker'
import { BudgetBar } from '../../components/BudgetBar'
import { Card, SectionTitle } from '../../components/primitives'
import styles from './mobile.module.css'

interface Props {
  model: ExpenseModel
  month: string
  onMonthChange: (month: string) => void
}

export function MonthlySummaryMobile({ model, month, onMonthChange }: Props) {
  const { dataset, months, lookup } = model

  const budgets = useMemo(() => {
    return computeBudgetHealth(dataset.transactions, dataset.categories, month, {
      includeForecast: true,
    })
      .filter((b) => b.budgetCents > 0)
      .sort((a, b) => b.budgetCents - a.budgetCents)
  }, [dataset, month])

  return (
    <div className={styles.section}>
      <SectionTitle>Budget vs actual</SectionTitle>
      <MonthPicker months={months} value={month} onChange={onMonthChange} layout="bar" />
      <p className={styles.hint}>Includes forecast (unpaid card) charges.</p>
      <Card>
        {budgets.map((b) => (
          <BudgetBar
            key={b.categoryId}
            name={b.name}
            icon={lookup.category(b.categoryId)?.icon}
            actualCents={b.actualCents}
            budgetCents={b.budgetCents}
            ratio={b.ratio}
            status={b.status}
          />
        ))}
      </Card>
    </div>
  )
}
