import { useCallback, useMemo, useState } from 'react'
import type { ExpenseModel } from '../../useExpenseData'
import type { ExpenseActions } from '../../actions'
import {
  averageMonthlyCents,
  checkinInvestedCents,
  computeMonthlyTotals,
  defaultBudgetMonth,
  formatCents,
  latestCheckin,
  milestonesReached,
  monthlyFlows,
  planFromToday,
  rebaseline,
  rebaselineSummary,
  type MoneyFormat,
  type Rebaseline,
  yearOffsetFromDate,
} from '../../../engine'
import type { InvestedSnapshot } from './checkinDate'
import type { ChartSeries } from '../../charts/LinearChart'
import { Card, SectionTitle } from '../../components/primitives'
import { SegmentedControl } from '../../components/SegmentedControl'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { failureMessage } from '../../hooks/useFailureToast'
import { useToast } from '../../hooks/useToast'
import { Presence } from '../../components/Presence'
import { EXIT_MS } from '../../hooks/motion'
import { GoalControls } from './GoalControls'
import { ScenarioManager } from './ScenarioManager'
import { GoalsIntro } from './GoalsIntro'
import { GoalsViewSwitch } from './GoalsViewSwitch'
import { GoalsPanel } from './GoalsPanel'
import { mobileViewOf, type AssumptionsFocus, type MobilePlanView, type TabView } from './goalsView'
import { useGoalsScrollMemory } from './useGoalsScrollMemory'
import { GOALS_CONTENT_ANCHOR_ID } from './goalsAnchors'
import { AdjustStack } from './AdjustStack'
import type { UnsavedActions } from './UnsavedGroup'
import { GoalsNarrative } from './GoalsNarrative'
import { NominalPreview } from './NominalPreview'
import { SecondaryCharts } from './SecondaryCharts'
import { ProgressView } from './ProgressView'
import { AssumptionsView } from './AssumptionsView'
import { useScenarioEditor, type DiscardPrompt } from './useScenarioEditor'
import { activePlan } from './scenarioSelection'
import { NetWorthChart } from './charts/NetWorthChart'
import { NetWorthNowCard } from './charts/NetWorthNowCard'
import { todayIso } from '../../components/transactionFormState'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { formatCheckinDate } from './checkinDate'
import styles from './goals.module.css'
import progressStyles from './progress.module.css'

type DisplayMode = 'nominal' | 'purchasing-power'

const DISPLAY_MODE_OPTIONS: { value: DisplayMode; label: string }[] = [
  { value: 'nominal', label: 'Nominal' },
  { value: 'purchasing-power', label: 'Purchasing power' },
]

/** How the tab was reached: 'checkin' opens Progress with the check-in form up. */
export type GoalsEntry = 'checkin' | null

interface GoalsTabProps {
  model: ExpenseModel
  actions?: ExpenseActions | undefined
  entry?: GoalsEntry
}

/**
 * What a re-baseline from Progress is about to write, asked before it is written. Held
 * inside Presence so the sheet can animate out after the answer.
 */
function RebaselineSheet({
  preview,
  format,
  onConfirm,
  onCancel,
}: {
  preview: Rebaseline | null
  format: MoneyFormat
  onConfirm: () => void
  onCancel: () => void
}) {
  const summary = preview ? rebaselineSummary(preview, format, formatCheckinDate) : []
  // What is being replaced is said too, so the sheet is not only about what it puts in.
  const replaced = preview?.previous.planStartDate
    ? `, instead of ${formatCheckinDate(preview.previous.planStartDate)} from ${formatCents(preview.previous.investedCents, format)}`
    : ''
  const start = preview
    ? `The plan restarts on ${formatCheckinDate(preview.patch.planStartDate)} from ${formatCents(preview.patch.startInvestedCents, format)}${replaced}. From then on ahead or behind measures only what you do next.`
    : ''
  return (
    <Presence show={preview !== null} exitMs={EXIT_MS.sheet}>
      {preview ? (
        <ConfirmSheet
          title="Re-baseline the plan from the latest check-in?"
          message={summary.length > 0 ? [start, ...summary] : start}
          confirmLabel="Re-baseline"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      ) : null}
    </Presence>
  )
}

/**
 * Asked before loading another scenario over unsaved edits. Held inside Presence so the
 * sheet keeps its text while it animates out. A detached draft has no saved scenario to
 * "save changes" to, so it is told to save the draft as a new one.
 */
function DiscardSheet({
  pending,
  open,
  detached,
  name,
  onConfirm,
  onCancel,
}: DiscardPrompt) {
  const keep = detached ? 'Save the draft as a new scenario first to keep them.' : 'Save changes first to keep them.'
  return (
    <Presence show={open} exitMs={EXIT_MS.sheet}>
      {pending ? (
        <ConfirmSheet
          title={detached ? 'Discard the unsaved draft?' : `Discard unsaved changes to ${name}?`}
          message={`Loading ${pending.name} drops the edits made here. ${keep}`}
          confirmLabel="Discard"
          destructive
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      ) : null}
    </Presence>
  )
}

/**
 * What sits between the view switch and a view's own content: Plan's intro and glossary (on
 * a screen wide enough to lead with them), and the anchor a tap on the switch scrolls to.
 * Progress and Assumptions start at the anchor.
 */
function GoalsContentTop({ showIntro }: { showIntro: boolean }) {
  return (
    <>
      <GoalsIntro placement="top" show={showIntro} />
      <div id={GOALS_CONTENT_ANCHOR_ID} className={styles.contentAnchor} />
    </>
  )
}

/** Edits to a saved scenario, which the Adjust section row can save or drop; none otherwise. */
function unsavedActions(
  canWrite: boolean,
  dirty: boolean,
  actions: UnsavedActions,
): UnsavedActions | undefined {
  return canWrite && dirty ? actions : undefined
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

  const {
    activeId,
    draft,
    deferredDraft,
    hiddenIds,
    activeScenario,
    dirty,
    saving,
    discardPrompt,
    patchDraft,
    selectScenario,
    onSelectScenario,
    onSelectEditing,
    onToggleVisible,
    onActivate,
    onSaveChanges,
    onSaveDraft,
    onDiscard,
  } = useScenarioEditor(dataset, actions, avgSaving)

  // Progress writes the plan directly, so it asks first, saying what moves. The editor's
  // draft of that same plan is patched alongside the write, or the header would report
  // unsaved changes and saving them would write the old start back over the re-baseline.
  const format = useMoneyFormat()
  const [rebaselinePreview, setRebaselinePreview] = useState<Rebaseline | null>(null)
  const onRebaseline = useCallback(() => {
    if (!actions || !plan || !latestSnapshot) return
    setRebaselinePreview(rebaseline(plan, latestSnapshot))
  }, [actions, plan, latestSnapshot])
  const { showToast } = useToast()
  const onRebaselineConfirm = useCallback(async () => {
    if (!actions || !plan || !latestSnapshot || !rebaselinePreview) return
    // The draft is re-baselined from its own values, so an unsaved life-event or house
    // edit in the editor moves with the start rather than being overwritten by the plan's.
    const draftPatch = activeId === plan.id ? rebaseline(draft, latestSnapshot).patch : null
    setRebaselinePreview(null)
    try {
      await actions.updateScenario(plan.id, rebaselinePreview.patch)
    } catch (e) {
      // The plan did not move, so the editor's draft must not either, or Plan would offer to
      // save a start that was never written.
      showToast(failureMessage(e), 'error')
      return
    }
    if (draftPatch) patchDraft(draftPatch)
  }, [actions, plan, latestSnapshot, rebaselinePreview, activeId, patchDraft, draft, showToast])

  // Scatter points: actual invested values from check-ins plotted on the hero chart.
  const checkinExtraSeries = useMemo<ChartSeries | null>(() => {
    if (!activeScenario?.planStartDate) return null
    const points = dataset.wealthCheckins
      .map((c) => {
        const offset = yearOffsetFromDate(activeScenario.planStartDate!, c.checkinDate)
        if (offset === null) return null
        const value = checkinInvestedCents(c, dataset.wealthAccounts)
        return { xIndex: offset, value }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
    if (points.length === 0) return null
    return { id: 'actuals-overlay', color: '#f59e0b', values: [], kind: 'scatter', points }
  }, [activeScenario, dataset.wealthCheckins, dataset.wealthAccounts])

  const heroTodayIndex = useMemo(() => {
    if (!activeScenario?.planStartDate) return undefined
    const today = new Date().toISOString().slice(0, 10)
    const offset = yearOffsetFromDate(activeScenario.planStartDate, today)
    return offset !== null && offset >= 0 ? offset : undefined
  }, [activeScenario])

  return (
    <div className={styles.stack}>
      <SectionTitle>Goals</SectionTitle>

      <GoalsViewSwitch
        view={view}
        onViewChange={changeView}
        planHalf={mobilePlanView}
        onPlanHalfChange={changePlanHalf}
        memory={memory}
      />

      <GoalsPanel view={view} planHalf={mobilePlanView}>
      <GoalsContentTop showIntro={view === 'plan'} />

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
        <>
        <RebaselineSheet
          preview={rebaselinePreview}
          format={format}
          onConfirm={() => { void onRebaselineConfirm() }}
          onCancel={() => setRebaselinePreview(null)}
        />
        <ProgressView
          accounts={dataset.wealthAccounts}
          checkins={dataset.wealthCheckins}
          transactions={dataset.transactions}
          milestones={milestones}
          reached={reachedMilestones}
          plan={plan}
          actions={actions}
          canWrite={actions != null}
          onOpenAssumptions={openAccountsSetup}
          openCheckinForm={checkinEntry}
          cashReserveMonths={dataset.settings.cashReserveMonths}
          openBudgetMonth={defaultBudgetMonth(todayIso(), dataset.settings.budgetRolloverDay)}
          onRebaseline={onRebaseline}
          fromToday={fromToday}
        />
        </>
      ) : null}
      {view === 'plan' ? (
        <>
          <div className={styles.layout} data-mobile-view={mobilePlanView}>
        <div className={styles.areaSidebar}>
          <div className={styles.areaScenarios}>
            <ScenarioManager
              scenarios={dataset.goalScenarios}
              activeId={activeId}
              draft={draft}
              hiddenIds={hiddenIds}
              canWrite={actions != null}
              actions={actions}
              dirty={dirty}
              saving={saving}
              onSelect={onSelectScenario}
              onSelectEditing={onSelectEditing}
              onToggleVisible={onToggleVisible}
              onPatch={patchDraft}
              onSaveDraft={onSaveDraft}
              onSaveChanges={onSaveChanges}
              onDiscard={onDiscard}
              onActivate={onActivate}
              onScenarioCreated={selectScenario}
            />
            <DiscardSheet {...discardPrompt} />
          </div>
          {mobilePlanView === 'adjust' ? (
            // Phone only: only the phone's row offers Adjust.
            <AdjustStack
              draft={deferredDraft}
              unsaved={unsavedActions(actions != null, dirty, {
                name: draft.name,
                saving,
                onSave: onSaveChanges,
                onDiscard,
              })}
            />
          ) : null}
          <div className={styles.areaControls}>
            <Card>
              <GoalControls draft={draft} latest={latestSnapshot} onChange={patchDraft} />
            </Card>
          </div>
        </div>
        <div className={styles.areaOutputs}>
          <div className={styles.areaNow}>
            <NetWorthNowCard
              draft={deferredDraft}
              latest={latestSnapshot}
              milestones={milestones}
              reached={reachedMilestones}
            />
          </div>
          <div className={`${styles.heroBlock} ${styles.areaHero}`}>
            <NetWorthChart
              scenarios={dataset.goalScenarios}
              hiddenIds={hiddenIds}
              onToggleVisible={onToggleVisible}
              draft={deferredDraft}
              milestones={milestones}
              activeId={activeId}
              dirty={dirty}
              variant="hero"
              footer={
                <>
                  <GoalsNarrative draft={deferredDraft} milestones={milestones} compact />
                  <div className={progressStyles.displayModeRow}>
                    <SegmentedControl
                      options={DISPLAY_MODE_OPTIONS}
                      value={displayMode}
                      onChange={changeDisplayMode}
                      ariaLabel="Value display mode"
                      layout="compact"
                    />
                  </div>
                  {displayMode === 'nominal' ? (
                    <NominalPreview
                      saved={dataset.settings.assumedInflation}
                      preview={previewInflation}
                      onPreview={setPreviewInflation}
                      onOpenAssumptions={actions ? openInflationSetting : undefined}
                    />
                  ) : null}
                </>
              }
              extraSeries={checkinExtraSeries ? [checkinExtraSeries] : []}
              fromToday={fromToday}
              nominalMode={displayMode === 'nominal'}
              viewInflation={previewInflation}
              {...(heroTodayIndex !== undefined ? { todayIndex: heroTodayIndex } : {})}
            />
          </div>
          <div className={styles.areaSecondary}>
            <SecondaryCharts
              scenarios={dataset.goalScenarios}
              draft={deferredDraft}
              monthly={monthly}
              milestones={milestones}
              reached={reachedMilestones}
              activeId={activeId}
              dirty={dirty}
              fromToday={fromToday}
            />
          </div>
        </div>
      </div>
        </>
      ) : null}
      <GoalsIntro placement="bottom" show={view === 'plan'} />
      </GoalsPanel>
    </div>
  )
}

export default GoalsTab
