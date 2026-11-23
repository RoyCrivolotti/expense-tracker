import { lazy, Suspense, type ReactNode } from 'react'
import type { ExpenseModel } from './useExpenseData'
import type { ExpenseActions } from './actions'
import type { ExpenseTheme } from './hooks/useExpenseTheme'
import type { TabId } from './nav/navItems'
import { DashboardTab } from './tabs/DashboardTab'
import { TransactionsTab } from './tabs/TransactionsTab'
import { SettingsTab } from './tabs/SettingsTab'
import type { useTabNavigation } from './useTabNavigation'
import { fullMonthLabel } from '../engine'
import styles from './ExpensesApp.module.css'

const GoalsTab = lazy(() => import('./tabs/goals/GoalsTab'))
const AnalyticsTab = lazy(() => import('./tabs/AnalyticsTab'))

/** The pane of the tab shown. While the rows of the month are being read it says so and is not for pressing. */
export function TabPane({ hydrating, month, children }: { hydrating: boolean; month: string; children: ReactNode }) {
  return (
    <div className={hydrating ? `${styles.tabPane} ${styles.hydrating}` : styles.tabPane} aria-busy={hydrating}>
      {hydrating ? (
        <p role="status" className={styles.monthLoading}>
          Loading {fullMonthLabel(month)}…
        </p>
      ) : null}
      {children}
    </div>
  )
}

interface TabViewProps {
  tab: TabId
  model: ExpenseModel
  month: string
  onMonthChange: (month: string) => void
  actions?: ExpenseActions | undefined
  theme: ExpenseTheme
  onThemeChange: (next: ExpenseTheme) => void
  ownerAccess?: { pendingCount: number } | undefined
  accountEmail?: string | undefined
  /** Where each tab was asked to open, and the moves between tabs (the dashboard's check-in nudge, a drill-down). */
  nav: ReturnType<typeof useTabNavigation>
  onRunSetup: () => void
  onTxnSelectModeChange: (selecting: boolean) => void
  monthNavigation: number
}

/** Analytics and Goals, each its own chunk, read the first time they are opened. */
function LazyTabView({ tab, model, month, onMonthChange, actions, nav }: TabViewProps) {
  if (tab === 'analytics') {
    return (
      <Suspense fallback={<div className={styles.center}>Loading analytics…</div>}>
        <AnalyticsTab
          model={model}
          month={month}
          onMonthChange={onMonthChange}
          actions={actions}
          onOpenTransactions={nav.openTransactions}
          onUseBaselineInGoals={nav.useBaselineInGoals}
        />
      </Suspense>
    )
  }
  return (
    <Suspense fallback={<div className={styles.center}>Loading goals…</div>}>
      <GoalsTab model={model} actions={actions} entry={nav.goalsEntry} />
    </Suspense>
  )
}

export function TabView(props: TabViewProps) {
  const { tab, model, month, actions, theme, onThemeChange, ownerAccess, accountEmail, nav } = props
  switch (tab) {
    case 'transactions':
      return (
        <TransactionsTab
          model={model}
          month={month}
          actions={actions}
          onSelectModeChange={props.onTxnSelectModeChange}
          monthNavigation={props.monthNavigation}
          entry={nav.txnEntry}
        />
      )
    case 'analytics':
    case 'goals':
      return <LazyTabView {...props} />
    case 'settings':
      return (
        <SettingsTab
          model={model}
          month={month}
          actions={actions}
          theme={theme}
          onThemeChange={onThemeChange}
          ownerAccess={ownerAccess}
          accountEmail={accountEmail}
          onRunSetup={props.onRunSetup}
          entry={nav.settingsEntry}
        />
      )
    default:
      return (
        <DashboardTab
          model={model}
          month={month}
          actions={actions}
          onNavigate={nav.selectTab}
          onLogCheckin={nav.logCheckin}
          onOpenImport={nav.openImport}
        />
      )
  }
}
