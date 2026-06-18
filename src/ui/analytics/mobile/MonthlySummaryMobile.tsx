import { useMemo, useState } from 'react'
import type { ExpenseModel } from '../../useExpenseData'
import { computeBudgetHealth } from '../../../engine'
import { MonthPicker } from '../../components/MonthPicker'
import { BudgetBar } from '../../components/BudgetBar'
import { Card } from '../../components/primitives'
import styles from './mobile.module.css'

export function MonthlySummaryMobile({ model }: { model: ExpenseModel }) {
  const { dataset, months } = model
  const [month, setMonth] = useState(months[months.length - 1] ?? '')

  const budgets = useMemo(() => {
    return computeBudgetHealth(dataset.transactions, dataset.categories, month, {
      includeForecast: true,
    })
      .filter((b) => b.budgetCents > 0)
      .sort((a, b) => b.budgetCents - a.budgetCents)
  }, [dataset, month])

  return (
    <div className={styles.section}>
      <MonthPicker months={months} value={month} onChange={setMonth} />
      <p className={styles.hint}>Budget vs actual (includes forecast charges).</p>
      <Card>
        {budgets.map((b) => (
          <BudgetBar
            key={b.categoryId}
            name={b.name}
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
