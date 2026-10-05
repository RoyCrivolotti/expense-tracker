import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { SectionTitle } from '../components/primitives'
import { useIsMobile } from '../hooks/useIsMobile'
import { CashView } from './cash/CashView'
import { YearlyOverviewTable } from './YearlyOverviewTable'
import { YearlyOverviewMobile } from './mobile/YearlyOverviewMobile'
import tableStyles from './analytics.module.css'
import tabStyles from '../tabs/tabs.module.css'

/** The yearly paid-flow ledger lives with Cash: its running balance is a cash number. */
function YearlySection({ model }: { model: ExpenseModel }) {
  const isMobile = useIsMobile()
  return (
    <section className={tabStyles.analyticsSection}>
      <SectionTitle>Yearly overview</SectionTitle>
      <p className={tableStyles.note}>
        Paid flows per month — unpaid card charges sit in the Forecast column until their
        statement is paid.
      </p>
      {isMobile ? <YearlyOverviewMobile model={model} /> : <YearlyOverviewTable model={model} />}
    </section>
  )
}

/** Do my numbers match reality? Cash is paid-basis by nature, so no basis toggle here. */
export function CashPanel({
  model,
  month,
  actions,
}: {
  model: ExpenseModel
  month: string
  actions?: ExpenseActions | undefined
}) {
  return (
    <>
      <CashView model={model} month={month} actions={actions} />
      <YearlySection model={model} />
    </>
  )
}
