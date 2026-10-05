import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { SectionTitle } from '../components/primitives'
import { useIsMobile } from '../hooks/useIsMobile'
import { CashReconciliationTable } from './CashReconciliationTable'
import { CashReconMobile } from './mobile/CashReconMobile'
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
  actions,
}: {
  model: ExpenseModel
  actions?: ExpenseActions | undefined
}) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <>
        <CashReconMobile model={model} {...(actions ? { onSetCashActual: actions.setCashActual } : {})} />
        <YearlySection model={model} />
      </>
    )
  }
  return (
    <>
      <section className={tabStyles.analyticsSection}>
        <SectionTitle>Cash reconciliation</SectionTitle>
        <p className={tableStyles.note}>
          Cash Δ = income − debit spend − paid card statements − investments. Expected cash is the
          running balance from your opening balance; enter the real cash you count after paying the
          cards (~12th–15th). Total gap is actual − expected; carryover is last month&apos;s gap and
          this month is the new drift since then. Unpaid liability is what still sits on
          not-yet-paid card statements.
        </p>
        <CashReconciliationTable
          model={model}
          {...(actions ? { onSetCashActual: actions.setCashActual } : {})}
        />
      </section>
      <YearlySection model={model} />
    </>
  )
}
