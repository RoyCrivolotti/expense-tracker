import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { SectionTitle } from '../components/primitives'
import { useIsMobile } from '../hooks/useIsMobile'
import { CashReconciliationTable } from './CashReconciliationTable'
import { CashReconMobile } from './mobile/CashReconMobile'
import tableStyles from './analytics.module.css'
import tabStyles from '../tabs/tabs.module.css'

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
      <CashReconMobile model={model} {...(actions ? { onSetCashActual: actions.setCashActual } : {})} />
    )
  }
  return (
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
  )
}
