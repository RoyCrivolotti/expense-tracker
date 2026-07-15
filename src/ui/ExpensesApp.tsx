import { useRef, useState, lazy, Suspense } from 'react'
import type { ExpenseDataSource } from '../data/dataSource'
import { useExpenseData, type ExpenseModel } from './useExpenseData'
import { useExpenseActions } from './useExpenseActions'
import type { ExpenseActions, ExpenseModalState } from './actions'
import { useExpenseTheme, type ExpenseTheme } from './hooks/useExpenseTheme'
import { needsOnboarding } from '../domain/onboarding/needsOnboarding'
import { type GroupGrants } from '../domain/accessGroups'
import { AppShell } from './nav/AppShell'
import type { TabId } from './nav/navItems'
import { OfflineBanner } from './components/OfflineBanner'
import { AppHeaderActions } from './components/AppHeaderActions'
import { ExpensesOnboarding } from './components/ExpensesOnboarding'
import { AppLoadingSkeleton } from './components/AppLoadingSkeleton'
import { TransactionModal } from './components/TransactionModal'
import { DashboardTab } from './tabs/DashboardTab'
import { TransactionsTab } from './tabs/TransactionsTab'
import { AnalyticsTab } from './tabs/AnalyticsTab'
import { SettingsTab } from './tabs/SettingsTab'
import { isOnboardingSkipped } from './onboarding/onboardingStorage'
import { ConnectivityProvider } from './hooks/ConnectivityProvider'
import { useConnectivityState } from './hooks/useConnectivityState'
import { useConnectivity } from './hooks/useConnectivity'
import { usePullToRefresh } from './hooks/usePullToRefresh'
import { useRefreshToast } from './hooks/useRefreshToast'
import styles from './ExpensesApp.module.css'

const GoalsTab = lazy(() => import('./tabs/goals/GoalsTab'))

// Tabs without a month picker / FAB-heavy footer: trim the large bottom dead zone.
const COMPACT_FOOTER_TABS: ReadonlySet<TabId> = new Set(['goals', 'analytics', 'settings'])

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

  if (data.status === 'loading') return <AppLoadingSkeleton label="Loading expenses" />
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
      reload={data.reload}
      refreshing={data.refreshing}
      refreshOutcome={data.refreshOutcome}
      fromCache={data.fromCache ?? false}
      {...(data.snapshotAt ? { snapshotAt: data.snapshotAt } : {})}
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
  reload,
  refreshing,
  refreshOutcome,
  fromCache,
  snapshotAt,
  ownerAccess,
  accountEmail,
  hubGrants,
}: {
  source: ExpenseDataSource
  model: ExpenseModel
  applyPatch: ReturnType<typeof useExpenseData>['applyPatch']
  reload: () => void
  refreshing: boolean
  refreshOutcome: ReturnType<typeof useExpenseData>['refreshOutcome']
  fromCache: boolean
  snapshotAt?: string
  ownerAccess?: { pendingCount: number }
  accountEmail?: string
  hubGrants: GroupGrants
}) {
  return (
    <ConnectivityProvider fromCache={fromCache} {...(snapshotAt ? { snapshotAt } : {})}>
      <ExpensesAppReady
        source={source}
        model={model}
        applyPatch={applyPatch}
        reload={reload}
        refreshing={refreshing}
        refreshOutcome={refreshOutcome}
        hubGrants={hubGrants}
        {...(ownerAccess ? { ownerAccess } : {})}
        {...(accountEmail ? { accountEmail } : {})}
      />
    </ConnectivityProvider>
  )
}

function ExpensesAppReady({
  source,
  model,
  applyPatch,
  reload,
  refreshing,
  refreshOutcome,
  ownerAccess,
  accountEmail,
  hubGrants,
}: {
  source: ExpenseDataSource
  model: ExpenseModel
  applyPatch: ReturnType<typeof useExpenseData>['applyPatch']
  reload: () => void
  refreshing: boolean
  refreshOutcome: ReturnType<typeof useExpenseData>['refreshOutcome']
  ownerAccess?: { pendingCount: number }
  accountEmail?: string
  hubGrants: GroupGrants
}) {
  const online = useConnectivity()
  const { readOnly, snapshotAt } = useConnectivityState()
  const contentRef = useRef<HTMLElement>(null)
  usePullToRefresh(contentRef, { onRefresh: reload, enabled: online })
  useRefreshToast(refreshing, refreshOutcome)

  const [theme, setTheme] = useExpenseTheme()
  const [tab, setTab] = useState<TabId>('dashboard')
  const [month, setMonth] = useState<string | null>(null)
  const [modal, setModal] = useState<ExpenseModalState>(null)
  const [onboardingOpen, setOnboardingOpen] = useState(
    () => source.canWrite && !readOnly && needsOnboarding(model.dataset) && !isOnboardingSkipped(),
  )
  const actions = useExpenseActions(source, applyPatch, setModal, readOnly)

  const activeMonth = month ?? model.months[model.months.length - 1] ?? ''
  const showPicker =
    tab !== 'settings' && tab !== 'goals' && model.months.length > 0
  const settingsBadge = ownerAccess?.pendingCount ?? 0

  return (
    <>
      <ExpensesOnboarding
        open={onboardingOpen}
        source={source}
        applyPatch={applyPatch}
        onAdd={() => actions?.onAdd()}
        onClose={() => setOnboardingOpen(false)}
      />
      <AppShell
        activeId={tab}
        onSelect={setTab}
        title="Expenses"
        settingsBadge={settingsBadge}
        hubGrants={hubGrants}
        compactFooter={COMPACT_FOOTER_TABS.has(tab)}
        goalsWide={tab === 'goals'}
        contentRef={contentRef}
        banner={
          readOnly ? (
            <OfflineBanner online={online} {...(snapshotAt ? { snapshotAt } : {})} />
          ) : null
        }
        {...(actions ? { onAdd: actions.onAdd } : {})}
        headerRight={
          <AppHeaderActions
            months={model.months}
            activeMonth={activeMonth}
            onMonthChange={setMonth}
            showPicker={showPicker}
            online={online}
            refreshing={refreshing}
            onRefresh={reload}
          />
        }
      >
        <div key={tab} className={styles.tabPane}>
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
        </div>
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
      hint={modal.mode === 'add' ? modal.hint : undefined}
      onClose={onClose}
    />
  )
}
