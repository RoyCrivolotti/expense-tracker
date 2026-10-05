import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { EmptyState, SectionTitle } from '../components/primitives'
import { AnalyticsShell } from '../analytics/AnalyticsShell'
import styles from './tabs.module.css'

export function AnalyticsTab({
  model,
  month,
  actions,
}: {
  model: ExpenseModel
  month: string
  actions?: ExpenseActions | undefined
}) {
  if (model.months.length === 0) {
    return (
      <div className={styles.stack}>
        <SectionTitle>Analytics</SectionTitle>
        <EmptyState
          actionLabel={actions?.onAdd ? 'Add transaction' : undefined}
          onAction={actions?.onAdd}
        >
          No data yet — add transactions to get started.
        </EmptyState>
      </div>
    )
  }

  return <AnalyticsShell model={model} month={month} actions={actions} />
}

/* The analytics chunk is lazy-loaded (like Goals), which needs a default export. */
export default AnalyticsTab
