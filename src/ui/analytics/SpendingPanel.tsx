import type { AnalyticsBasis } from '../../engine'
import type { ExpenseModel } from '../useExpenseData'
import { SectionTitle } from '../components/primitives'
import { useIsMobile } from '../hooks/useIsMobile'
import { MonthlySummaryGrid } from './MonthlySummaryGrid'
import { MonthlySummaryMobile } from './mobile/MonthlySummaryMobile'
import tableStyles from './analytics.module.css'
import tabStyles from '../tabs/tabs.module.css'

const GRID_NOTE: Record<AnalyticsBasis, string> = {
  committed:
    'Committed spend per category and budget month — includes forecast (unpaid card) charges, so it matches your workbook regardless of payment status. Scroll sideways for more months.',
  paid: 'Paid spend per category and budget month — unpaid card charges are left out until their statement is paid. Scroll sideways for more months.',
}

/** Where does the money go? For now the workbook grid (phone: the budget bars). */
export function SpendingPanel({
  model,
  month,
  basis,
}: {
  model: ExpenseModel
  month: string
  basis: AnalyticsBasis
}) {
  const isMobile = useIsMobile()
  if (isMobile) return <MonthlySummaryMobile model={model} month={month} basis={basis} />
  return (
    <section className={tabStyles.analyticsSection}>
      <SectionTitle>Monthly summary</SectionTitle>
      <p className={tableStyles.note}>{GRID_NOTE[basis]}</p>
      <MonthlySummaryGrid model={model} month={month} basis={basis} />
    </section>
  )
}
