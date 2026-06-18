import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { EmptyState, SectionTitle } from '../components/primitives'
import { useIsMobile } from '../hooks/useIsMobile'
import { AnalyticsTabDesktop } from './AnalyticsTabDesktop'
import { AnalyticsTabMobile } from '../analytics/mobile/AnalyticsTabMobile'
import styles from './tabs.module.css'

export function AnalyticsTab({
  model,
  actions,
}: {
  model: ExpenseModel
  actions?: ExpenseActions | undefined
}) {
  const isMobile = useIsMobile()

  if (model.months.length === 0) {
    return (
      <div className={styles.stack}>
        <SectionTitle>Analytics</SectionTitle>
        <EmptyState>No data yet — add transactions to get started.</EmptyState>
      </div>
    )
  }

  return isMobile ? (
    <AnalyticsTabMobile model={model} actions={actions} />
  ) : (
    <AnalyticsTabDesktop model={model} actions={actions} />
  )
}
