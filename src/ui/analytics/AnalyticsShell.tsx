import { useState } from 'react'
import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { SectionTabs } from '../components/SectionTabs'
import { ANALYTICS_VIEWS, type AnalyticsView } from './analyticsView'
import { AnalyticsFilterRow } from './AnalyticsFilterRow'
import { useAnalyticsFilters } from './useAnalyticsFilters'
import { OverviewPanel } from './OverviewPanel'
import { SpendingPanel } from './SpendingPanel'
import { CashPanel } from './CashPanel'

/**
 * Analytics as three views under one sticky row, the same on phone and desktop.
 * The header month picker is the only month source; the basis toggle applies to
 * Overview and Spending, never to Cash, which is paid-basis by definition.
 */
export function AnalyticsShell({
  model,
  month,
  actions,
}: {
  model: ExpenseModel
  month: string
  actions?: ExpenseActions | undefined
}) {
  const [view, setView] = useState<AnalyticsView>('overview')
  const { basis, setBasis } = useAnalyticsFilters()

  return (
    <SectionTabs
      id="analytics-view"
      ariaLabel="Analytics view"
      options={ANALYTICS_VIEWS}
      value={view}
      onChange={setView}
    >
      {view !== 'cash' && <AnalyticsFilterRow basis={basis} onBasisChange={setBasis} />}
      {view === 'overview' && <OverviewPanel model={model} month={month} basis={basis} />}
      {view === 'spending' && <SpendingPanel model={model} month={month} basis={basis} />}
      {view === 'cash' && <CashPanel model={model} actions={actions} />}
    </SectionTabs>
  )
}
