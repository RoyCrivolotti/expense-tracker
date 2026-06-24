import { useState, lazy, Suspense } from 'react'
import type { ExpenseDataSource } from '../data/dataSource'
import { useExpenseData, type ExpenseModel } from './useExpenseData'
import { useExpenseActions } from './useExpenseActions'
import type { ExpenseActions, ExpenseModalState } from './actions'
import { useExpenseTheme, type ExpenseTheme } from './hooks/useExpenseTheme'
import { needsOnboarding } from '../domain/onboarding/needsOnboarding'
import { type GroupGrants } from '../domain/accessGroups'
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

const GoalsTab = lazy(() => import('./tabs/goals/GoalsTab'))

function TabView({
  tab,
  model,
  month,
  onMonthChange,
  actions,
  theme,
  onThemeChange,
  ownerAccess,
  accountEmail,
  onNavigate,
}: {
  tab: TabId
  model: ExpenseModel
  month: string
  onMonthChange: (month: string) => void
  actions?: ExpenseActions | undefined
  theme: ExpenseTheme
  onThemeChange: (next: ExpenseTheme) => void
  ownerAccess?: { pendingCount: number } | undefined
  accountEmail?: string | undefined
  onNavigate: (tab: TabId) => void
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
    case 'goals':
      return (
        <Suspense fallback={<div className={styles.center}>Loading goals…</div>}>
          <GoalsTab model={model} actions={actions} />
        </Suspense>
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
          accountEmail={accountEmail}
        />
      )
    default:
      return (
        <DashboardTab
          model={model}
          month={month}
          actions={actions}
          onNavigate={onNavigate}
        />
      )
  }
}

export function ExpensesApp({
  source,
  ownerAccess,
  accountEmail,
  hubGrants,
}: {
  source: ExpenseDataSource
  ownerAccess?: { pendingCount: number }
  accountEmail?: string
  hubGrants: GroupGrants
}) {
  const data = useExpenseData(source)

  if (data.status === 'loading') return <div className={styles.center}>Loading…</div>
  if (data.status === 'error' || !data.model) {
    return (
      <div className={styles.center}>
        <p>Couldn&apos;t load expense data{data.error ? `: ${data.error}` : ''}.</p>
        <button type="button" className={styles.retryButton} onClick={data.reload}>
          Try again
        </button>
      </div>
    )
  }

  return (
    <ExpensesAppLoaded
      source={source}
      model={data.model}
      applyPatch={data.applyPatch}
      hubGrants={hubGrants}
      {...(ownerAccess ? { ownerAccess } : {})}
      {...(accountEmail ? { accountEmail } : {})}
    />
  )
}

function ExpensesAppLoaded({
  source,
  model,
  applyPatch,
  ownerAccess,
  accountEmail,
  hubGrants,
}: {
  source: ExpenseDataSource
  model: ExpenseModel
  applyPatch: ReturnType<typeof useExpenseData>['applyPatch']
  ownerAccess?: { pendingCount: number }
  accountEmail?: string
  hubGrants: GroupGrants
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
  const showPicker =
    tab !== 'settings' && tab !== 'goals' && model.months.length > 0
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
        hubGrants={hubGrants}
        compactFooter={tab === 'goals'}
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
          accountEmail={accountEmail}
          onNavigate={setTab}
        />
      </AppShell>
      {modal && actions && (
        <ActiveTransactionModal
          modal={modal}
          actions={actions}
          model={model}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}

function ActiveTransactionModal({
  modal,
  actions,
  model,
  onClose,
}: {
  modal: Exclude<ExpenseModalState, null>
  actions: ExpenseActions
  model: ExpenseModel
  onClose: () => void
}) {
  return (
    <TransactionModal
      model={model}
      actions={actions}
      editing={modal.mode === 'edit' ? modal.txn : null}
      seed={modal.mode === 'add' ? modal.seed : undefined}
      onClose={onClose}
    />
  )
}
