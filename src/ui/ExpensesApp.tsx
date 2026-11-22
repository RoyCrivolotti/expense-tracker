import { useEffect, useRef, useState, lazy, Suspense, type ReactNode } from 'react'
import type { ExpenseDataSource } from '../data/dataSource'
import { useExpenseData, type ExpenseData, type ExpenseModel } from './useExpenseData'
import { currentLedgerMode } from '../config/ledgerMode'
import { useExpenseActions } from './useExpenseActions'
import type { ExpenseActions, ExpenseModalState } from './actions'
import { useExpenseTheme, type ExpenseTheme } from './hooks/useExpenseTheme'
import { needsOnboarding } from '../domain/onboarding/needsOnboarding'
import { type GroupGrants } from '../domain/accessGroups'
import { AppShell } from './nav/AppShell'
import { LeaveGuardProvider } from './nav/LeaveGuardProvider'
import { useGuardLeave } from './nav/leaveGuardContext'
import type { TabId } from './nav/navItems'
import { PullToRefreshIndicator } from './components/PullToRefreshIndicator'
import { ExpensesOfflineBanner } from './components/ExpensesOfflineBanner'
import { AppHeaderActions } from './components/AppHeaderActions'
import { ExpensesOnboarding } from './components/ExpensesOnboarding'
import { prefetchOnboardingWizard } from './components/onboardingChunk'
import { AppLoadingSkeleton } from './components/AppLoadingSkeleton'
import { PresenceValue } from './components/Presence'
import { ActiveTransactionModal } from './ActiveTransactionModal'
import { ReviewProvider } from './capture/ReviewProvider'
import { EXIT_MS } from './hooks/motion'
import { DashboardTab } from './tabs/DashboardTab'
import { TransactionsTab } from './tabs/TransactionsTab'
import { SettingsTab, type SettingsView } from './tabs/SettingsTab'
import { useTabNavigation } from './useTabNavigation'
import { ModelTips } from './tips/ModelTips'
import { clearOnboardingSkip, isOnboardingSkipped } from './onboarding/onboardingStorage'
import { AccountOwnerContext, forgetUnownedSettings } from './hooks/accountOwner'
import { ConnectivityProvider } from './hooks/ConnectivityProvider'
import { AssumedInflationContext } from './hooks/assumedInflationContext'
import { MarketVolatilityContext } from './hooks/marketVolatilityContext'
import { MoneyFormatProvider } from './hooks/MoneyFormatProvider'
import { useConnectivityState } from './hooks/useConnectivityState'
import { useConnectivity } from './hooks/useConnectivity'
import { usePullToRefresh } from './hooks/usePullToRefresh'
import { useRefreshAll } from './hooks/useRefreshAll'
import { useRefreshToast } from './hooks/useRefreshToast'
import { useToast } from './hooks/useToast'
import { MONTH_LOCKED_HINT } from './tabs/selectionLockHints'
import { fullMonthLabel } from '../engine'
import styles from './ExpensesApp.module.css'

const GoalsTab = lazy(() => import('./tabs/goals/GoalsTab'))
const AnalyticsTab = lazy(() => import('./tabs/AnalyticsTab'))
const LedgerExpensesApp = lazy(() => import('./LedgerExpensesApp'))
import type { GoalsEntry } from './tabs/goals/GoalsTab'
import type { TransactionsEntry } from './tabs/transactionsEntry'

// Tabs without a month picker / FAB-heavy footer: trim the large bottom dead zone.
const COMPACT_FOOTER_TABS: ReadonlySet<TabId> = new Set(['goals', 'analytics', 'settings'])
const NO_PICKER_TABS: ReadonlySet<TabId> = new Set(['settings', 'goals'])

/** Only Transactions has a selection for the month to disturb. */
function monthLockedFor(
  tab: TabId,
  txnSelecting: boolean,
): boolean {
  return tab === 'transactions' && txnSelecting
}

/** The month the user picked, else the one a selection is holding, else the newest. */
function shownMonth(
  picked: string | null,
  held: string | null,
  months: string[],
): string {
  return picked ?? held ?? months[months.length - 1] ?? ''
}

/** A model that holds only the months looked at reads the rows of the month shown. */
function useViewMonth(
  viewMonth: ((month: string) => void) | undefined,
  month: string,
): void {
  useEffect(() => {
    viewMonth?.(month)
  }, [viewMonth, month])
}

/** The pane of the tab shown. While the rows of the month are being read it says so and is not for pressing. */
function TabPane({ hydrating, month, children }: { hydrating: boolean; month: string; children: ReactNode }) {
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
  onLogCheckin,
  onOpenImport,
  settingsEntry,
  goalsEntry,
  txnEntry,
  onOpenTransactions,
  onUseBaselineInGoals,
  onRunSetup,
  onTxnSelectModeChange,
  monthNavigation,
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
  /** Opens Goals on Progress with the check-in form up, from the dashboard's nudge. */
  onLogCheckin: () => void
  onOpenImport: () => void
  settingsEntry: SettingsView | null
  goalsEntry: GoalsEntry
  txnEntry: TransactionsEntry | null
  onOpenTransactions: (preset: TransactionsEntry) => void
  onUseBaselineInGoals: (monthlyCents: number) => void
  onRunSetup: () => void
  onTxnSelectModeChange: (selecting: boolean) => void
  monthNavigation: number
}) {
  switch (tab) {
    case 'transactions':
      return (
        <TransactionsTab
          model={model}
          month={month}
          actions={actions}
          onSelectModeChange={onTxnSelectModeChange}
          monthNavigation={monthNavigation}
          entry={txnEntry}
        />
      )
    case 'analytics':
      return (
        <Suspense fallback={<div className={styles.center}>Loading analytics…</div>}>
          <AnalyticsTab
            model={model}
            month={month}
            onMonthChange={onMonthChange}
            actions={actions}
            onOpenTransactions={onOpenTransactions}
            onUseBaselineInGoals={onUseBaselineInGoals}
          />
        </Suspense>
      )
    case 'goals':
      return (
        <Suspense fallback={<div className={styles.center}>Loading goals…</div>}>
          <GoalsTab model={model} actions={actions} entry={goalsEntry} />
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
          onRunSetup={onRunSetup}
          entry={settingsEntry}
        />
      )
    default:
      return (
        <DashboardTab
          model={model}
          month={month}
          actions={actions}
          onNavigate={onNavigate}
          onLogCheckin={onLogCheckin}
          onOpenImport={onOpenImport}
        />
      )
  }
}

export interface ExpensesAppProps {
  source: ExpenseDataSource
  ownerAccess?: { pendingCount: number }
  accountEmail?: string
  hubGrants: GroupGrants
}

/**
 * Reads the ledger in parts (`src/config/ledgerMode.ts`) unless this browser turned that off, and then reads the
 * whole dataset, as it always did. The ledger path is a separate chunk, which a browser that turned it off downloads
 * and never runs. It hands back to `DatasetApp` for a source without parts, for a ledger with a month of more rows
 * than one request returns, and when the reference cannot be read and nothing is saved.
 */
export function ExpensesApp(props: ExpensesAppProps) {
  const [mode] = useState(currentLedgerMode)
  const { canWrite } = props.source
  const { accountEmail } = props
  useEffect(() => {
    if (canWrite && !isOnboardingSkipped(accountEmail)) prefetchOnboardingWizard()
  }, [canWrite, accountEmail])
  if (mode === 'off') return <DatasetApp {...props} />
  return (
    <Suspense fallback={<AppLoadingSkeleton label="Loading expenses" />}>
      <LedgerExpensesApp {...props} mode={mode} fallback={<DatasetApp {...props} />} view={ExpensesAppView} />
    </Suspense>
  )
}

function DatasetApp(props: ExpensesAppProps) {
  return <ExpensesAppView {...props} data={useExpenseData(props.source, props.accountEmail)} />
}

/** The app over data a hook has loaded: the whole dataset (`useExpenseData`) or a ledger (`useLedgerData`). */
export function ExpensesAppView({
  source,
  ownerAccess,
  accountEmail,
  hubGrants,
  data,
}: ExpensesAppProps & { data: ExpenseData }) {
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
      {...(data.viewMonth ? { viewMonth: data.viewMonth } : {})}
      hydrating={data.hydrating ?? false}
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
  viewMonth,
  hydrating,
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
  viewMonth?: (month: string) => void
  hydrating: boolean
  ownerAccess?: { pendingCount: number }
  accountEmail?: string
  hubGrants: GroupGrants
}) {
  // What earlier builds kept on this device under keys that named no one cannot be told apart, so it is dropped.
  useEffect(() => {
    if (accountEmail) forgetUnownedSettings()
  }, [accountEmail])
  return (
    <AccountOwnerContext value={accountEmail}>
      <ConnectivityProvider fromCache={fromCache} {...(snapshotAt ? { snapshotAt } : {})}>
        <MoneyFormatProvider
          currencyCode={model.dataset.settings.currencyCode}
          numberLocale={model.dataset.settings.numberLocale}
        >
          <AssumedInflationContext.Provider value={model.dataset.settings.assumedInflation}>
            <MarketVolatilityContext.Provider value={model.dataset.settings.marketVolatility}>
              <LeaveGuardProvider>
                <ExpensesAppReady
                  source={source}
                  model={model}
                  applyPatch={applyPatch}
                  reload={reload}
                  refreshing={refreshing}
                  refreshOutcome={refreshOutcome}
                  {...(viewMonth ? { viewMonth } : {})}
                  hydrating={hydrating}
                  hubGrants={hubGrants}
                  {...(ownerAccess ? { ownerAccess } : {})}
                  {...(accountEmail ? { accountEmail } : {})}
                />
              </LeaveGuardProvider>
            </MarketVolatilityContext.Provider>
          </AssumedInflationContext.Provider>
        </MoneyFormatProvider>
      </ConnectivityProvider>
    </AccountOwnerContext>
  )
}

function ExpensesAppReady({
  source,
  model,
  applyPatch,
  reload,
  refreshing,
  refreshOutcome,
  viewMonth,
  hydrating,
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
  viewMonth?: (month: string) => void
  hydrating: boolean
  ownerAccess?: { pendingCount: number }
  accountEmail?: string
  hubGrants: GroupGrants
}) {
  const online = useConnectivity()
  const { readOnly, snapshotAt } = useConnectivityState()
  const contentRef = useRef<HTMLElement>(null)
  const refresh = useRefreshAll(reload)
  const { pullPx, isPulling } = usePullToRefresh({
    onRefresh: refresh,
    enabled: online && !refreshing,
    refreshing,
  })
  useRefreshToast(refreshing, refreshOutcome)
  const { showToast } = useToast()

  const [theme, setTheme] = useExpenseTheme()
  const guardLeave = useGuardLeave()
  const [month, setMonth] = useState<string | null>(null)
  // The header's month picker belongs to the shell, but on Transactions it drives the
  // list, and a selection there must not have the list changed under it. This is the
  // month the selection started in, held until it ends: with no month picked the header
  // follows the newest one, so a refresh or a transaction added for next month would
  // otherwise move the list to a month the locked arrows cannot leave.
  const [selectionMonth, setSelectionMonth] = useState<string | null>(null)
  // Counts the user's own month moves. The active month also changes on its own, when a
  // refresh brings in a newer month and none was picked, and only a user's move should
  // make Transactions show that month.
  const [monthNavigation, setMonthNavigation] = useState(0)
  const navigateMonth = (next: string) => {
    setMonth(next)
    setMonthNavigation((n) => n + 1)
  }
  const nav = useTabNavigation(guardLeave, navigateMonth)
  const { tab, goalsEntry, txnEntry, settingsEntry } = nav
  const [modal, setModal] = useState<ExpenseModalState>(null)
  const [onboardingOpen, setOnboardingOpen] = useState(
    () => source.canWrite && !readOnly && needsOnboarding(model.dataset) && !isOnboardingSkipped(accountEmail),
  )
  // Captured once per wizard run rather than re-derived from `model.dataset`, since the
  // wizard's own setup adds categories/accounts as it goes — re-checking `needsOnboarding`
  // after it starts would flip this mid-run. Re-entry via "Run setup" in Settings always
  // sets this false; the initial auto-open (tenant had nothing yet) starts it true.
  const [onboardingFirstRun, setOnboardingFirstRun] = useState(() => needsOnboarding(model.dataset))
  const actions = useExpenseActions(source, applyPatch, setModal, readOnly, reload)

  const activeMonth = shownMonth(month, selectionMonth, model.months)
  useViewMonth(viewMonth, activeMonth)
  const holdMonthForSelection = (selecting: boolean) => {
    setSelectionMonth(selecting ? activeMonth : null)
  }
  const showPicker = !NO_PICKER_TABS.has(tab) && model.months.length > 0
  const settingsBadge = ownerAccess?.pendingCount ?? 0

  return (
    <ModelTips key={accountEmail ?? ''} model={model} actions={actions}>
      <ReviewProvider model={model} actions={actions} formOpen={modal !== null}>
        <ExpensesOnboarding
          open={onboardingOpen}
          source={source}
          dataset={model.dataset}
          firstRun={onboardingFirstRun}
          applyPatch={applyPatch}
          onAdd={() => actions?.onAdd()}
          onClose={() => setOnboardingOpen(false)}
        />
        <AppShell
          activeId={tab}
          onSelect={nav.selectTab}
          title="Expenses"
          settingsBadge={settingsBadge}
          hubGrants={hubGrants}
          compactFooter={COMPACT_FOOTER_TABS.has(tab)}
          wide={tab === 'goals' || tab === 'analytics'}
          contentRef={contentRef}
          pullIndicator={<PullToRefreshIndicator pullPx={pullPx} isPulling={isPulling} refreshing={refreshing} />}
          banner={<ExpensesOfflineBanner readOnly={readOnly} online={online} {...(snapshotAt ? { snapshotAt } : {})} />}
          // Hidden while rows are selected: the selection bar sits in the same corner and
          // there is nothing to add a transaction for mid-batch-action anyway.
          {...(actions && tab !== 'goals' && selectionMonth === null ? { onAdd: actions.onAdd } : {})}
          headerRight={
            <AppHeaderActions
              months={model.months}
              activeMonth={activeMonth}
              onMonthChange={navigateMonth}
              showPicker={showPicker}
              pickerLocked={monthLockedFor(tab, selectionMonth !== null)}
              onLockedPickerPress={() => showToast(MONTH_LOCKED_HINT)}
              online={online}
              refreshing={refreshing}
              onRefresh={refresh}
              savedMonths={model.savedMonths}
            />
          }
        >
          <TabPane key={tab} hydrating={hydrating} month={activeMonth}>
            <TabView
              tab={tab}
              model={model}
              month={activeMonth}
              onMonthChange={navigateMonth}
              actions={actions}
              theme={theme}
              onThemeChange={setTheme}
              ownerAccess={ownerAccess}
              accountEmail={accountEmail}
              onNavigate={nav.selectTab}
              onLogCheckin={nav.logCheckin}
              onOpenImport={nav.openImport}
              settingsEntry={settingsEntry}
              goalsEntry={goalsEntry}
              txnEntry={txnEntry}
              onOpenTransactions={nav.openTransactions}
              onUseBaselineInGoals={nav.useBaselineInGoals}
              onTxnSelectModeChange={holdMonthForSelection}
              monthNavigation={monthNavigation}
              onRunSetup={() => {
                clearOnboardingSkip(accountEmail)
                setOnboardingFirstRun(false)
                setOnboardingOpen(true)
              }}
            />
          </TabPane>
        </AppShell>
        <PresenceValue value={actions ? modal : null} exitMs={EXIT_MS.sheet}>
          {(shown) =>
            actions && (
              <ActiveTransactionModal modal={shown} actions={actions} model={model} onClose={() => setModal(null)} />
            )
          }
        </PresenceValue>
      </ReviewProvider>
    </ModelTips>
  )
}
