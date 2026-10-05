import type { AnalyticsBasis } from '../../engine'
import type { ExpenseModel } from '../useExpenseData'
import { SectionTitle } from '../components/primitives'
import { useIsMobile } from '../hooks/useIsMobile'
import { InsightsCharts } from '../charts/InsightsCharts'
import { MonthlyTotalsTable } from './MonthlyTotalsTable'
import { MonthlyTotalsMobile } from './mobile/MonthlyTotalsMobile'
import { YearlyOverviewTable } from './YearlyOverviewTable'
import { YearlyOverviewMobile } from './mobile/YearlyOverviewMobile'
import tableStyles from './analytics.module.css'
import tabStyles from '../tabs/tabs.module.css'

/** How am I doing? For now the charts, Monthly totals and Yearly overview, rehomed. */
export function OverviewPanel({
  model,
  month,
  basis,
}: {
  model: ExpenseModel
  month: string
  basis: AnalyticsBasis
}) {
  const isMobile = useIsMobile()
  return (
    <>
      <InsightsCharts model={model} month={month} basis={basis} />

      <section className={tabStyles.analyticsSection}>
        <SectionTitle>Monthly totals</SectionTitle>
        {isMobile ? (
          <MonthlyTotalsMobile model={model} basis={basis} />
        ) : (
          <MonthlyTotalsTable model={model} basis={basis} />
        )}
      </section>

      <section className={tabStyles.analyticsSection}>
        <SectionTitle>Yearly overview</SectionTitle>
        <p className={tableStyles.note}>
          Paid flows per month — unpaid card charges sit in the Forecast column until their
          statement is paid.
        </p>
        {isMobile ? <YearlyOverviewMobile model={model} /> : <YearlyOverviewTable model={model} />}
      </section>
    </>
  )
}
