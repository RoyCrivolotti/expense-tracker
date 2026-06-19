import type { ExpenseModel } from '../useExpenseData'
import { SectionTitle } from '../components/primitives'
import { CategoryPieChart } from './CategoryPieChart'
import { MonthlyIncomeExpenseChart, YtdIncomeExpenseChart } from './IncomeExpenseCharts'
import chartStyles from './charts.module.css'
import styles from '../tabs/tabs.module.css'

interface Props {
  model: ExpenseModel
  month: string
}

export function InsightsCharts({ model, month }: Props) {
  return (
    <section className={styles.analyticsSection}>
      <SectionTitle>Insights</SectionTitle>
      <div className={chartStyles.chartSection}>
        <MonthlyIncomeExpenseChart model={model} />
        <YtdIncomeExpenseChart model={model} month={month} />
        <div className={chartStyles.fullWidth}>
          <CategoryPieChart model={model} month={month} />
        </div>
      </div>
    </section>
  )
}
