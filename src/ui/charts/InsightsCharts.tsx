import type { ExpenseModel } from '../useExpenseData'
import type { AnalyticsBasis } from '../../engine'
import { SectionTitle } from '../components/primitives'
import { CategoryPieChart } from './CategoryPieChart'
import { MonthlyIncomeExpenseChart, YtdIncomeExpenseChart } from './IncomeExpenseCharts'
import chartStyles from './charts.module.css'
import styles from '../tabs/tabs.module.css'

interface Props {
  model: ExpenseModel
  month: string
  basis?: AnalyticsBasis
}

export function InsightsCharts({ model, month, basis = 'committed' }: Props) {
  return (
    <section className={styles.analyticsSection}>
      <SectionTitle>Insights</SectionTitle>
      <div className={chartStyles.chartSection}>
        <MonthlyIncomeExpenseChart model={model} basis={basis} />
        <YtdIncomeExpenseChart model={model} month={month} basis={basis} />
        <div className={chartStyles.fullWidth}>
          <CategoryPieChart model={model} month={month} basis={basis} />
        </div>
      </div>
    </section>
  )
}
