import type { RefObject } from 'react'
import type { ExpenseModel } from './useExpenseData'
import type { ExpenseActions } from './actions'
import type { ExpenseTheme } from './hooks/useExpenseTheme'
import type { GroupGrants } from '../domain/accessGroups'
import { AppShell } from './nav/AppShell'
import type { TabId } from './nav/navItems'
import { PullToRefreshIndicator } from './components/PullToRefreshIndicator'
import { ExpensesOfflineBanner } from './components/ExpensesOfflineBanner'
import { AppHeaderActions } from './components/AppHeaderActions'
import type { useTabNavigation } from './useTabNavigation'
import { MONTH_LOCKED_HINT } from './tabs/selectionLockHints'
import { TabPane, TabView } from './ExpensesTabView'

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

/** What the shell is drawn from: the app's state, which `ExpensesAppReady` holds. */
export interface ExpensesShellProps {
  model: ExpenseModel
  hydrating: boolean
  ownerAccess?: { pendingCount: number } | undefined
  accountEmail?: string | undefined
  hubGrants: GroupGrants
  refreshing: boolean
  shell: {
    online: boolean
    readOnly: boolean
    snapshotAt?: string | undefined
    contentRef: RefObject<HTMLElement | null>
    refresh: () => void
    pullPx: number
    isPulling: boolean
  }
  months: {
    selectionMonth: string | null
    setSelectionMonth: (month: string | null) => void
    monthNavigation: number
    navigateMonth: (month: string) => void
    nav: ReturnType<typeof useTabNavigation>
  }
  activeMonth: string
  actions: ExpenseActions | undefined
  theme: ExpenseTheme
  onThemeChange: (next: ExpenseTheme) => void
  showToast: (message: string) => void
  onRunSetup: () => void
}

/** The shell round the tab shown: the rail or bottom bar, the header with its month and refresh, and the tab's pane. */
export function ExpensesShell(props: ExpensesShellProps) {
  const { model, hydrating, ownerAccess, hubGrants, refreshing, shell, months, activeMonth, actions } = props
  const { online, readOnly, snapshotAt, contentRef, refresh, pullPx, isPulling } = shell
  const { selectionMonth, setSelectionMonth, navigateMonth, nav } = months
  const { tab } = nav
  const holdMonthForSelection = (selecting: boolean) => {
    setSelectionMonth(selecting ? activeMonth : null)
  }
  const showPicker = !NO_PICKER_TABS.has(tab) && model.months.length > 0
  const settingsBadge = ownerAccess?.pendingCount ?? 0
  return (
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
          onLockedPickerPress={() => props.showToast(MONTH_LOCKED_HINT)}
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
          theme={props.theme}
          onThemeChange={props.onThemeChange}
          ownerAccess={ownerAccess}
          accountEmail={props.accountEmail}
          nav={nav}
          onTxnSelectModeChange={holdMonthForSelection}
          monthNavigation={months.monthNavigation}
          onRunSetup={props.onRunSetup}
        />
      </TabPane>
    </AppShell>
  )
}
