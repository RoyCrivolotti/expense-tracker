import { useCallback, useState } from 'react'
import { mobileViewOf, type AssumptionsFocus, type MobilePlanView, type TabView } from './goalsView'
import { useGoalsNarrow } from './useGoalsNarrow'
import { useGoalsScrollMemory } from './useGoalsScrollMemory'
import type { DisplayMode } from './PlanHero'
import type { GoalsEntry } from './GoalsTab'

function initialView(entry: GoalsEntry | undefined): TabView {
  return entry === 'checkin' ? 'progress' : 'plan'
}

/**
 * Where the Goals tab is: its view, the phone's half of Plan, what Assumptions scrolls to, and the Nominal view's
 * mode and tried rate, with every way of moving between them noting where the reader was.
 */
export function useGoalsNavigation(entry: GoalsEntry | undefined) {
  const [view, setView] = useState<TabView>(() => initialView(entry))
  // The dashboard's nudge opens the check-in form once; leaving Progress and coming back
  // within the tab must not open it again.
  const [checkinEntry, setCheckinEntry] = useState(entry === 'checkin')
  // The Nominal note links to the assumed inflation in Assumptions, and the empty Progress view
  // to the accounts; Assumptions then scrolls to that card. Any other way of getting to the
  // view must not.
  const [assumptionsFocus, setAssumptionsFocus] = useState<AssumptionsFocus | null>(null)
  // The rate the Nominal view is being tried at, if not the saved one. It lives only as long
  // as the chart it was tried on: leaving the view or the Nominal mode drops it.
  const [previewInflation, setPreviewInflation] = useState<number | null>(null)
  // Mobile-only: swaps the chart block for the controls form in place, in lieu
  // of a separate route. Ignored on desktop, where both are always visible.
  const [mobilePlanView, setMobilePlanView] = useState<MobilePlanView>('chart')
  // Leaving a view by any route, the row or a link, notes where it was for coming back.
  const memory = useGoalsScrollMemory()
  const narrow = useGoalsNarrow()
  const current = mobileViewOf(view, mobilePlanView)
  const changeView = useCallback(
    (next: TabView) => {
      memory.leave(current)
      setCheckinEntry(false)
      setAssumptionsFocus(null)
      setPreviewInflation(null)
      setView(next)
    },
    [memory, current],
  )
  const changePlanHalf = useCallback(
    (next: MobilePlanView) => {
      memory.leave(current)
      setMobilePlanView(next)
    },
    [memory, current],
  )
  const openAssumptions = useCallback(
    (focus: AssumptionsFocus) => {
      changeView('assumptions')
      setAssumptionsFocus(focus)
    },
    [changeView],
  )
  const openInflationSetting = useCallback(() => openAssumptions('inflation'), [openAssumptions])
  const openAccountsSetup = useCallback(() => openAssumptions('accounts'), [openAssumptions])
  const [displayMode, setDisplayMode] = useState<DisplayMode>('purchasing-power')
  const changeDisplayMode = useCallback((next: DisplayMode) => {
    setPreviewInflation(null)
    setDisplayMode(next)
  }, [])
  return {
    view,
    checkinEntry,
    assumptionsFocus,
    previewInflation,
    setPreviewInflation,
    mobilePlanView,
    memory,
    narrow,
    changeView,
    changePlanHalf,
    openInflationSetting,
    openAccountsSetup,
    displayMode,
    changeDisplayMode,
  }
}

export type GoalsNavigation = ReturnType<typeof useGoalsNavigation>
