import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ExpenseModel } from '../../useExpenseData'
import type { ExpenseActions } from '../../actions'
import {
  averageMonthlyCents,
  checkinInvestedCents,
  computeMonthlyTotals,
  formatCents,
  latestCheckin,
  milestonesReached,
  monthlyFlows,
  planFromToday,
} from '../../../engine'
import type { InvestedSnapshot } from './checkinDate'
import { SectionTitle } from '../../components/primitives'
import { GoalsViewSwitch } from './GoalsViewSwitch'
import { GoalsPanel } from './GoalsPanel'
import {
  entryDraftPatch,
  mobileViewOf,
  type AssumptionsFocus,
  type MobilePlanView,
  type TabView,
} from './goalsView'
import { useToast } from '../../hooks/useToast'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { useGoalsNarrow } from './useGoalsNarrow'
import { useGoalsScrollMemory } from './useGoalsScrollMemory'
import { GOALS_CONTENT_ANCHOR_ID } from './goalsAnchors'
import { ProgressPane } from './ProgressPane'
import { AssumptionsView } from './AssumptionsView'
import { useScenarioEditor } from './useScenarioEditor'
import { useGoalsUnsavedWork } from './useGoalsUnsavedWork'
import { useStarredLevers } from './useStarredLevers'
import { PlanView } from './PlanView'
import type { DisplayMode } from './PlanHero'
import { activePlan } from './scenarioSelection'
import styles from './goals.module.css'

/**
 * How the tab was reached: 'checkin' opens Progress with the check-in form up;
 * a baseline entry opens Plan with the measured monthly spend prefilled into the
 * draft's annual spend: an unsaved edit that goes through the ordinary Save
 * path, never a silent write.
 */
export type GoalsEntry = 'checkin' | { kind: 'baseline'; monthlyCents: number } | null

interface GoalsTabProps {
  model: ExpenseModel
  actions?: ExpenseActions | undefined
  entry?: GoalsEntry
}

function initialView(entry: GoalsEntry | undefined): TabView {
  return entry === 'checkin' ? 'progress' : 'plan'
}

export function GoalsTab({ model, actions, entry }: GoalsTabProps) {
  const { dataset } = model
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
  const milestones = dataset.settings.milestones
  const reachedMilestones = useMemo(
    () => milestonesReached(milestones, dataset.wealthCheckins, dataset.wealthAccounts),
    [milestones, dataset.wealthCheckins, dataset.wealthAccounts],
  )
  const latestSnapshot = useMemo<InvestedSnapshot | null>(() => {
    const latest = latestCheckin(dataset.wealthCheckins)
    if (!latest) return null
    return {
      investedCents: checkinInvestedCents(latest, dataset.wealthAccounts),
      date: latest.checkinDate,
    }
  }, [dataset.wealthCheckins, dataset.wealthAccounts])
  const monthly = useMemo(
    () => monthlyFlows(computeMonthlyTotals(dataset.transactions)),
    [dataset.transactions],
  )
  const plan = useMemo(() => activePlan(dataset.goalScenarios), [dataset.goalScenarios])
  // The plan as it stands from the latest check-in: derived, never saved, and null until
  // there is a dated plan and a check-in to restart it from.
  const fromToday = useMemo(() => planFromToday(plan, latestSnapshot), [plan, latestSnapshot])
  // Seeds a new draft's monthly contribution: what has actually gone into the
  // portfolio, not what was left over after expenses.
  const avgSaving = useMemo(
    () => averageMonthlyCents(monthly.map((m) => m.investedCents)),
    [monthly],
  )

  const editor = useScenarioEditor(dataset, actions, avgSaving)
  // The Analytics baseline lands as a draft edit, once per arrival (the tab remounts on
  // every navigation, so mount-time application is per-entry). Save remains the user's.
  const [baselineApplied, setBaselineApplied] = useState(false)
  const baselinePatch = entryDraftPatch(entry)
  if (baselinePatch && !baselineApplied) {
    setBaselineApplied(true)
    editor.patchDraft(baselinePatch)
  }
  // Said out loud as well: a measured spend equal to the plan's changes nothing on screen.
  const { showToast } = useToast()
  const moneyFormat = useMoneyFormat()
  const baselineAnnualCents = baselinePatch?.annualSpendCents ?? null
  useEffect(() => {
    if (baselineAnnualCents === null) return
    showToast(
      `Annual spend at FI set to ${formatCents(baselineAnnualCents, moneyFormat)} from your measured spending. Save to keep it.`,
    )
  }, [baselineAnnualCents, moneyFormat, showToast])
  useGoalsUnsavedWork(editor, actions != null)
  // Kept here, not in Plan, so a choice still being saved survives a visit to another view.
  const levers = useStarredLevers(dataset.settings.goalLevers, actions?.updateSettings)

  const viewSwitch = (
    <GoalsViewSwitch
      view={view}
      onViewChange={changeView}
      planHalf={mobilePlanView}
      onPlanHalfChange={changePlanHalf}
      memory={memory}
      inline={!narrow}
    />
  )

  return (
    <div className={styles.stack}>
      {narrow ? (
        <>
          <SectionTitle>Goals</SectionTitle>
          {viewSwitch}
        </>
      ) : (
        // One row on a wide screen: the title and the view switch took 60px each, a fifth of
        // what a laptop screen has above the chart.
        <SectionTitle action={viewSwitch}>Goals</SectionTitle>
      )}

      <GoalsPanel view={view} planHalf={mobilePlanView}>
        {/* Where a tap on the switch scrolls to: the start of whichever view's content follows. */}
        <div id={GOALS_CONTENT_ANCHOR_ID} className={styles.contentAnchor} />

        {view === 'assumptions' ? (
          <AssumptionsView
            accounts={dataset.wealthAccounts}
            checkins={dataset.wealthCheckins}
            settings={dataset.settings}
            actions={actions}
            onSettingsChange={actions ? (patch) => actions.updateSettings(patch) : undefined}
            focus={assumptionsFocus}
          />
        ) : null}
        {view === 'progress' ? (
          <ProgressPane
            dataset={dataset}
            actions={actions}
            plan={plan}
            latestSnapshot={latestSnapshot}
            fromToday={fromToday}
            reached={reachedMilestones}
            openCheckinForm={checkinEntry}
            onOpenAccountsSetup={openAccountsSetup}
            editor={editor}
          />
        ) : null}
        {view === 'plan' ? (
          <PlanView
            half={mobilePlanView}
            scenarios={dataset.goalScenarios}
            editor={editor}
            actions={actions}
            latest={latestSnapshot}
            milestones={milestones}
            reached={reachedMilestones}
            monthly={monthly}
            checkins={dataset.wealthCheckins}
            accounts={dataset.wealthAccounts}
            fromToday={fromToday}
            levers={levers}
            display={{
              mode: displayMode,
              onModeChange: changeDisplayMode,
              assumedInflation: dataset.settings.assumedInflation,
              preview: previewInflation,
              onPreview: setPreviewInflation,
              onOpenSetting: actions ? openInflationSetting : undefined,
            }}
          />
        ) : null}
      </GoalsPanel>
    </div>
  )
}

export default GoalsTab
