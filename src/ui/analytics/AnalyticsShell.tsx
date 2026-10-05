import { useMemo, useState } from 'react'
import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { SectionTabs } from '../components/SectionTabs'
import { ANALYTICS_VIEWS, type AnalyticsView } from './analyticsView'
import { AnalyticsFilterRow } from './AnalyticsFilterRow'
import { useAnalyticsFilters } from './useAnalyticsFilters'
import { OverviewView } from './overview/OverviewView'
import { SpendingPanel } from './SpendingPanel'
import { CashPanel } from './CashPanel'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Analytics as three views under one sticky row, the same on phone and desktop.
 * The header month picker is the only month source; the basis toggle applies to
 * Overview and Spending, never to Cash, which is paid-basis by definition.
 */
export function AnalyticsShell({
  model,
  month,
  onMonthChange,
  actions,
}: {
  model: ExpenseModel
  month: string
  onMonthChange: (month: string) => void
  actions?: ExpenseActions | undefined
}) {
  const [view, setView] = useState<AnalyticsView>('overview')
  const filters = useAnalyticsFilters()
  const today = useMemo(() => todayIso(), [])

  return (
    <SectionTabs
      id="analytics-view"
      ariaLabel="Analytics view"
      options={ANALYTICS_VIEWS}
      value={view}
      onChange={setView}
    >
      {view !== 'cash' && <AnalyticsFilterRow filters={filters} withPeriod={view === 'overview'} />}
      {view === 'overview' && (
        <OverviewView
          model={model}
          month={month}
          basis={filters.basis}
          period={filters.period}
          compare={filters.compare}
          today={today}
          onSelectMonth={onMonthChange}
          onShowView={setView}
        />
      )}
      {view === 'spending' && <SpendingPanel model={model} month={month} basis={filters.basis} />}
      {view === 'cash' && <CashPanel model={model} actions={actions} />}
    </SectionTabs>
  )
}
