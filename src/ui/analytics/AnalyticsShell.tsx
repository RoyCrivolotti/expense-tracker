import { useState } from 'react'
import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { defaultBudgetMonth } from '../../engine'
import { todayLocalIso } from '../dates'
import { SectionTabs } from '../components/SectionTabs'
import { ANALYTICS_VIEWS, type AnalyticsView } from './analyticsView'
import { AnalyticsFilterRow } from './AnalyticsFilterRow'
import { useAnalyticsFilters } from './useAnalyticsFilters'
import { OverviewView } from './overview/OverviewView'
import { SpendingView } from './spending/SpendingView'
import { CashPanel } from './CashPanel'
import type { TransactionsEntry } from '../tabs/transactionsEntry'

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
  onOpenTransactions,
  onUseBaselineInGoals,
}: {
  model: ExpenseModel
  month: string
  onMonthChange: (month: string) => void
  actions?: ExpenseActions | undefined
  onOpenTransactions?: ((preset: TransactionsEntry) => void) | undefined
  onUseBaselineInGoals?: ((monthlyCents: number) => void) | undefined
}) {
  const [view, setView] = useState<AnalyticsView>('overview')
  const filters = useAnalyticsFilters()
  // Local calendar day, not UTC: late evening west of Greenwich is not tomorrow. Read on
  // every render so a tab left open past midnight moves on with its next interaction; the
  // string only changes once a day, so the memos downstream hold.
  const today = todayLocalIso()
  const openMonth = defaultBudgetMonth(today, model.dataset.settings.budgetRolloverDay)

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
          openMonth={openMonth}
          onSelectMonth={onMonthChange}
          onShowView={setView}
          onUseBaselineInGoals={onUseBaselineInGoals}
        />
      )}
      {view === 'spending' && (
        <SpendingView
          model={model}
          month={month}
          basis={filters.basis}
          today={today}
          openMonth={openMonth}
          onOpenTransactions={onOpenTransactions}
        />
      )}
      {view === 'cash' && (
        <CashPanel model={model} month={month} openMonth={openMonth} actions={actions} />
      )}
    </SectionTabs>
  )
}
