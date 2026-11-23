import { useEffect, useRef, useState } from 'react'
import type { ExpenseDataSource } from '../data/dataSource'
import type { ExpenseModel, useExpenseData } from './useExpenseData'
import { useExpenseActions } from './useExpenseActions'
import type { ExpenseModalState } from './actions'
import { useExpenseTheme } from './hooks/useExpenseTheme'
import { needsOnboarding } from '../domain/onboarding/needsOnboarding'
import type { GroupGrants } from '../domain/accessGroups'
import { useGuardLeave } from './nav/leaveGuardContext'
import { ExpensesOnboarding } from './components/ExpensesOnboarding'
import { PresenceValue } from './components/Presence'
import { ActiveTransactionModal } from './ActiveTransactionModal'
import { ReviewProvider } from './capture/ReviewProvider'
import { EXIT_MS } from './hooks/motion'
import { useTabNavigation } from './useTabNavigation'
import { ExpensesShell } from './ExpensesShell'
import { ModelTips } from './tips/ModelTips'
import { clearOnboardingSkip, isOnboardingSkipped } from './onboarding/onboardingStorage'
import { useConnectivityState } from './hooks/useConnectivityState'
import { useConnectivity } from './hooks/useConnectivity'
import { usePullToRefresh } from './hooks/usePullToRefresh'
import { useRefreshAll } from './hooks/useRefreshAll'
import { useRefreshToast } from './hooks/useRefreshToast'
import { useToast } from './hooks/useToast'

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

export interface ReadyProps {
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
}

/** Whether the app is online or showing the saved copy, and the pull, button and toast that refresh it. */
function useShellRefresh({ reload, refreshing, refreshOutcome }: ReadyProps) {
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
  return { online, readOnly, snapshotAt, contentRef, refresh, pullPx, isPulling }
}

/** The month shown and the tab it is shown on. */
function useShellMonth(guardLeave: ReturnType<typeof useGuardLeave>) {
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
  return { month, selectionMonth, setSelectionMonth, monthNavigation, navigateMonth, nav }
}

/** Whether the setup wizard is open, and whether it is the first run (nothing set up yet). */
function useOnboardingOpen(
  { source, model, accountEmail }: ReadyProps,
  readOnly: boolean,
) {
  const [onboardingOpen, setOnboardingOpen] = useState(
    () => source.canWrite && !readOnly && needsOnboarding(model.dataset) && !isOnboardingSkipped(accountEmail),
  )
  // Captured once per wizard run rather than re-derived from `model.dataset`, since the
  // wizard's own setup adds categories/accounts as it goes — re-checking `needsOnboarding`
  // after it starts would flip this mid-run. Re-entry via "Run setup" in Settings always
  // sets this false; the initial auto-open (tenant had nothing yet) starts it true.
  const [onboardingFirstRun, setOnboardingFirstRun] = useState(() => needsOnboarding(model.dataset))
  return { onboardingOpen, setOnboardingOpen, onboardingFirstRun, setOnboardingFirstRun }
}

export function ExpensesAppReady(props: ReadyProps) {
  const { source, model, applyPatch, reload, viewMonth, accountEmail } = props
  const shell = useShellRefresh(props)
  const { readOnly } = shell
  const { showToast } = useToast()

  const [theme, setTheme] = useExpenseTheme()
  const guardLeave = useGuardLeave()
  const months = useShellMonth(guardLeave)
  const [modal, setModal] = useState<ExpenseModalState>(null)
  const onboarding = useOnboardingOpen(props, readOnly)
  const actions = useExpenseActions(source, applyPatch, setModal, readOnly, reload)

  const activeMonth = shownMonth(months.month, months.selectionMonth, model.months)
  useViewMonth(viewMonth, activeMonth)

  return (
    <ModelTips key={accountEmail ?? ''} model={model} actions={actions}>
      <ReviewProvider model={model} actions={actions} formOpen={modal !== null}>
        <ExpensesOnboarding
          open={onboarding.onboardingOpen}
          source={source}
          dataset={model.dataset}
          firstRun={onboarding.onboardingFirstRun}
          applyPatch={applyPatch}
          onAdd={() => actions?.onAdd()}
          onClose={() => onboarding.setOnboardingOpen(false)}
        />
        <ExpensesShell
          {...props}
          shell={shell}
          months={months}
          activeMonth={activeMonth}
          actions={actions}
          theme={theme}
          onThemeChange={setTheme}
          showToast={showToast}
          onRunSetup={() => {
            clearOnboardingSkip(accountEmail)
            onboarding.setOnboardingFirstRun(false)
            onboarding.setOnboardingOpen(true)
          }}
        />
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
