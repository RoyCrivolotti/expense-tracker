import { useState } from 'react'
import type { ExpenseDataSource } from '../data/dataSource'
import { useExpenseData, type ExpenseModel } from './useExpenseData'
import { useExpenseActions } from './useExpenseActions'
import type { ExpenseActions, ExpenseModalState } from './actions'
import { useExpenseTheme, type ExpenseTheme } from './hooks/useExpenseTheme'
import { needsOnboarding } from '../domain/onboarding/needsOnboarding'
import { AppShell } from './nav/AppShell'
import type { TabId } from './nav/navItems'
import { MonthPicker } from './components/MonthPicker'
import { TransactionModal } from './components/TransactionModal'
import { DashboardTab } from './tabs/DashboardTab'
import { TransactionsTab } from './tabs/TransactionsTab'
import { AnalyticsTab } from './tabs/AnalyticsTab'
import { SettingsTab } from './tabs/SettingsTab'
import { OnboardingWizard } from './onboarding/OnboardingWizard'
import { isOnboardingSkipped, skipOnboarding } from './onboarding/onboardingStorage'
import styles from './ExpensesApp.module.css'

function TabView({
  tab,
  model,
  month,
  onMonthChange,
  actions,
  theme,
  onThemeChange,
  ownerAccess,
}: {
  tab: TabId
  model: ExpenseModel
  month: string
  onMonthChange: (month: string) => void
  actions?: ExpenseActions | undefined
  theme: ExpenseTheme
  onThemeChange: (next: ExpenseTheme) => void
  ownerAccess?: { pendingCount: number } | undefined
}) {
  switch (tab) {
    case 'transactions':
      return <TransactionsTab model={model} month={month} actions={actions} />
    case 'analytics':
      return (
        <AnalyticsTab
          model={model}
          month={month}
          onMonthChange={onMonthChange}
          actions={actions}
        />
      )
    case 'settings':
      return (
        <SettingsTab
          model={model}
          month={month}
          actions={actions}
          theme={theme}
          onThemeChange={onThemeChange}
          ownerAccess={ownerAccess}
        />
      )
    default:
      return <DashboardTab model={model} month={month} actions={actions} />
  }
}

export function ExpensesApp({
  source,
  ownerAccess,
}: {
  source: ExpenseDataSource
  ownerAccess?: { pendingCount: number }
}) {
  const data = useExpenseData(source)

  if (data.status === 'loading') return <div className={styles.center}>Loading…</div>
  if (data.status === 'error' || !data.model) {
    return <div className={styles.center}>Couldn't load expense data: {data.error}</div>
  }

  return (
    <ExpensesAppLoaded
      source={source}
      model={data.model}
      applyPatch={data.applyPatch}
      {...(ownerAccess ? { ownerAccess } : {})}
    />
  )
}

function ExpensesAppLoaded({
  source,
  model,
  applyPatch,
  ownerAccess,
}: {
  source: ExpenseDataSource
  model: ExpenseModel
  applyPatch: ReturnType<typeof useExpenseData>['applyPatch']
  ownerAccess?: { pendingCount: number }
}) {
  const [theme, setTheme] = useExpenseTheme()
  const [tab, setTab] = useState<TabId>('dashboard')
  const [month, setMonth] = useState<string | null>(null)
  const [modal, setModal] = useState<ExpenseModalState>(null)
  const [onboardingOpen, setOnboardingOpen] = useState(
    () => source.canWrite && needsOnboarding(model.dataset) && !isOnboardingSkipped(),
  )
  const actions = useExpenseActions(source, applyPatch, setModal)

  const activeMonth = month ?? model.months[model.months.length - 1] ?? ''
  const showPicker = tab !== 'settings' && model.months.length > 0
  const settingsBadge = ownerAccess?.pendingCount ?? 0

  return (
    <>
      {onboardingOpen ? (
        <OnboardingWizard
          source={source}
          applyPatch={applyPatch}
          onDone={() => {
            setOnboardingOpen(false)
            actions?.onAdd()
          }}
          onSkip={() => {
            skipOnboarding()
            setOnboardingOpen(false)
          }}
        />
      ) : null}
      <AppShell
        activeId={tab}
        onSelect={setTab}
        title="Expenses"
        settingsBadge={settingsBadge}
        {...(actions ? { onAdd: actions.onAdd } : {})}
        {...(showPicker
          ? {
              headerRight: (
                <MonthPicker months={model.months} value={activeMonth} onChange={setMonth} />
              ),
            }
          : {})}
      >
        <TabView
          tab={tab}
          model={model}
          month={activeMonth}
          onMonthChange={setMonth}
          actions={actions}
          theme={theme}
          onThemeChange={setTheme}
          ownerAccess={ownerAccess}
        />
      </AppShell>
      {modal && (
        <TransactionModal
          model={model}
          source={source}
          editing={modal.mode === 'edit' ? modal.txn : null}
          onClose={() => setModal(null)}
          applyPatch={applyPatch}
        />
      )}
    </>
  )
}
