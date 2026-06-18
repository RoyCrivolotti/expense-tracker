import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { SectionTitle } from '../components/primitives'
import { MonthlySummaryGrid } from '../analytics/MonthlySummaryGrid'
import { MonthlyTotalsTable } from '../analytics/MonthlyTotalsTable'
import { CashReconciliationTable } from '../analytics/CashReconciliationTable'
import { YearlyOverviewTable } from '../analytics/YearlyOverviewTable'
import tableStyles from '../analytics/analytics.module.css'
import styles from './tabs.module.css'

export function AnalyticsTabDesktop({
  model,
  actions,
}: {
  model: ExpenseModel
  actions?: ExpenseActions | undefined
}) {
  return (
    <div className={styles.stack}>
      <section className={styles.analyticsSection}>
        <SectionTitle>Monthly summary</SectionTitle>
        <p className={tableStyles.note}>
          Total committed spend per category and budget month — includes forecast (unpaid card)
          charges, so it matches your workbook regardless of payment status. Scroll sideways for
          more months.
        </p>
        <MonthlySummaryGrid model={model} />
      </section>

      <section className={styles.analyticsSection}>
        <SectionTitle>Monthly totals</SectionTitle>
        <MonthlyTotalsTable model={model} />
      </section>

      <section className={styles.analyticsSection}>
        <SectionTitle>Cash reconciliation</SectionTitle>
        <p className={tableStyles.note}>
          Cash Δ = income − debit spend − paid card statements − investments. Expected cash is the
          running balance from your opening balance; enter the real cash you count after paying the
          cards (~12th–15th) and the Gap (actual − expected) flags any missed or mistaken entry.
          Unpaid liability is what still sits on not-yet-paid card statements.
        </p>
        <CashReconciliationTable
          model={model}
          {...(actions ? { onSetCashActual: actions.setCashActual } : {})}
        />
      </section>

      <section className={styles.analyticsSection}>
        <SectionTitle>Yearly overview</SectionTitle>
        <YearlyOverviewTable model={model} />
      </section>
    </div>
  )
}
