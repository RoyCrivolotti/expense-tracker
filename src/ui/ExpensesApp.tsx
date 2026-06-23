import { useState } from 'react'
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
  pendingCategoryFilter,
  onPendingCategoryApplied,
  onSelectCategory,
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
  pendingCategoryFilter?: number | null | undefined
  onPendingCategoryApplied?: (() => void) | undefined
  onSelectCategory?: ((categoryId: number) => void) | undefined
}) {
  switch (tab) {
    case 'transactions':
      return (
        <TransactionsTab
          model={model}
          month={month}
          actions={actions}
          pendingCategoryFilter={pendingCategoryFilter}
          onPendingCategoryApplied={onPendingCategoryApplied}
        />
      )
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
          accountEmail={accountEmail}
        />
      )
    default:
      return (
        <DashboardTab
          model={model}
          month={month}
          actions={actions}
          onSelectCategory={onSelectCategory}
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
    return <div className={styles.center}>Couldn't load expense data: {data.error}</div>
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
  const [pendingCategoryFilter, setPendingCategoryFilter] = useState<number | null>(null)
  const [onboardingOpen, setOnboardingOpen] = useState(
    () => source.canWrite && needsOnboarding(model.dataset) && !isOnboardingSkipped(),
  )
  const actions = useExpenseActions(source, applyPatch, setModal)

  const handleSelectCategory = (categoryId: number) => {
    setPendingCategoryFilter(categoryId)
    setTab('transactions')
  }

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
        hubGrants={hubGrants}
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
          pendingCategoryFilter={pendingCategoryFilter}
          onPendingCategoryApplied={() => setPendingCategoryFilter(null)}
          onSelectCategory={handleSelectCategory}
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
