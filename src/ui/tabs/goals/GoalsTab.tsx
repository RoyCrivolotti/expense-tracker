import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import type { ExpenseModel } from '../../useExpenseData'
import type { ExpenseActions } from '../../actions'
import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import {
  averageMonthlyCents,
  checkinInvestedCents,
  computeMonthlyTotals,
  defaultBudgetMonth,
  formatCents,
  formatPercent,
  latestCheckin,
  milestonesReached,
  monthlyFlows,
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
import { GoalsExplainer } from './GoalsExplainer'
import { GoalsNarrative } from './GoalsNarrative'
import { SecondaryCharts } from './SecondaryCharts'
import { ProgressView } from './ProgressView'
import { SetupView } from './SetupView'
import { draftFromDataset } from './goalsDefaults'
import { activePlan, initialEditorScenario } from './scenarioSelection'
import { NetWorthChart } from './charts/NetWorthChart'
import { NetWorthMiniChart } from './charts/NetWorthMiniChart'
import { NetWorthNowCard } from './charts/NetWorthNowCard'
import { todayIso } from '../../components/transactionFormState'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { formatCheckinDate } from './checkinDate'
import styles from './goals.module.css'
import progressStyles from './progress.module.css'

type TabView = 'plan' | 'progress' | 'setup'
type DisplayMode = 'nominal' | 'purchasing-power'
type MobilePlanView = 'chart' | 'adjust'

const VIEW_OPTIONS: { value: TabView; label: string }[] = [
  { value: 'plan', label: 'Plan' },
  { value: 'progress', label: 'Progress' },
  { value: 'setup', label: 'Setup' },
]

const MOBILE_PLAN_VIEW_OPTIONS: { value: MobilePlanView; label: string }[] = [
  { value: 'chart', label: 'Chart' },
  { value: 'adjust', label: 'Adjust' },
]

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

function scenarioToDraft(s: GoalScenario): NewGoalScenario {
  const { id, isActive, ...rest } = s
  void id
  void isActive
  return rest
}

// Fields the controls and the header can change; used to detect unsaved edits to a saved plan.
const EDIT_KEYS = [
  'color',
  'startInvestedCents',
  'monthlyContributionCents',
  'annualContributionGrowth',
  'expectedRealReturn',
  'horizonYears',
  'housePriceCents',
  'downPaymentFraction',
  'housePurchaseYear',
  'transactionCostsCents',
  'mortgageTermYears',
  'mortgageRateAnnual',
  'houseAppreciationRate',
  'rentMonthlyCents',
  'annualSpendCents',
  'safeWithdrawalRate',
  'planStartDate',
] as const satisfies readonly (keyof NewGoalScenario)[]

/** Whether the draft holds edits its saved scenario does not. */
function differsFrom(draft: NewGoalScenario, saved: GoalScenario): boolean {
  if (draft.name !== saved.name) return true
  if (JSON.stringify(draft.lifeEvents) !== JSON.stringify(saved.lifeEvents)) return true
  return EDIT_KEYS.some((k) => draft[k] !== saved[k])
}

/** A detached draft (no scenario loaded) holding edits its origin does not. */
function hasDetachedEdits(
  loaded: GoalScenario | null,
  base: GoalScenario | null,
  draft: NewGoalScenario,
): boolean {
  return loaded === null && base !== null && differsFrom(draft, base)
}

function bootstrapEditor(
  dataset: ExpenseModel['dataset'],
  avgSaving: number,
): { activeId: number | null; draft: NewGoalScenario } {
  const first = initialEditorScenario(dataset.goalScenarios)
  if (first) return { activeId: first.id, draft: scenarioToDraft(first) }
  return { activeId: null, draft: draftFromDataset(dataset, avgSaving) }
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
}: {
  pending: GoalScenario | null
  open: boolean
  detached: boolean
  name: string
  onConfirm: () => void
  onCancel: () => void
}) {
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

function initialView(entry: GoalsEntry | undefined): TabView {
  return entry === 'checkin' ? 'progress' : 'plan'
}

export function GoalsTab({ model, actions, entry }: GoalsTabProps) {
  const { dataset } = model
  const [view, setView] = useState<TabView>(() => initialView(entry))
  // The dashboard's nudge opens the check-in form once; leaving Progress and coming back
  // within the tab must not open it again.
  const [checkinEntry, setCheckinEntry] = useState(entry === 'checkin')
  // The Nominal note links to the assumed inflation in Setup, which then scrolls to it; any
  // other way of getting to Setup must not.
  const [focusInflation, setFocusInflation] = useState(false)
  const changeView = useCallback((next: TabView) => {
    setCheckinEntry(false)
    setFocusInflation(false)
    setView(next)
  }, [])
  const openInflationSetting = useCallback(() => {
    changeView('setup')
    setFocusInflation(true)
  }, [changeView])
  const [displayMode, setDisplayMode] = useState<DisplayMode>('purchasing-power')
  // Mobile-only: swaps the chart block for the controls form in place, in lieu
  // of a separate route. Ignored on desktop, where both are always visible.
  const [mobilePlanView, setMobilePlanView] = useState<MobilePlanView>('chart')
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
  // Seeds a new draft's monthly contribution: what has actually gone into the
  // portfolio, not what was left over after expenses.
  const avgSaving = useMemo(
    () => averageMonthlyCents(monthly.map((m) => m.investedCents)),
    [monthly],
  )

  const [activeId, setActiveId] = useState<number | null>(
    () => bootstrapEditor(dataset, avgSaving).activeId,
  )
  // The saved scenario the draft was last loaded from. Detaching to "Unsaved draft" clears
  // activeId but keeps the edits, and this is what they are still measured against.
  const [baseId, setBaseId] = useState<number | null>(
    () => bootstrapEditor(dataset, avgSaving).activeId,
  )
  const [draft, setDraft] = useState<NewGoalScenario>(
    () => bootstrapEditor(dataset, avgSaving).draft,
  )
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<number>>(() => new Set())
  // Controls read `draft` (instant); charts read the deferred copy so dragging a
  // slider never blocks on the projection recompute (keeps the thumb at 60fps).
  const deferredDraft = useDeferredValue(draft)

  // Editing keeps the saved plan active; we track dirtiness rather than
  // detaching to a fresh draft, so the user can save changes in place.
  const patchDraft = useCallback((patch: Partial<NewGoalScenario>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
  }, [])

  // Two different "current" scenarios: the one loaded in the editor (activeId), and the
  // owner's plan, which Progress measures against. Exploring a path must not change
  // what you are being measured against.
  const activeScenario = useMemo(
    () => dataset.goalScenarios.find((s) => s.id === activeId) ?? null,
    [dataset.goalScenarios, activeId],
  )
  const plan = useMemo(() => activePlan(dataset.goalScenarios), [dataset.goalScenarios])

  const dirty = useMemo(
    () => activeScenario !== null && differsFrom(draft, activeScenario),
    [activeScenario, draft],
  )
  // A detached draft has no saved scenario of its own, so loading another one would drop
  // its edits just as surely; it is measured against the scenario it came from.
  const baseScenario = useMemo(
    () => dataset.goalScenarios.find((s) => s.id === baseId) ?? null,
    [dataset.goalScenarios, baseId],
  )
  const detachedEdits = hasDetachedEdits(activeScenario, baseScenario, draft)

  const selectScenario = useCallback((scenario: GoalScenario) => {
    setActiveId(scenario.id)
    setBaseId(scenario.id)
    setDraft(scenarioToDraft(scenario))
    // The loaded scenario is always drawn as the editing line, so a hidden flag on it would
    // only leave the chip and legend saying two things at once.
    setHiddenIds((prev) => {
      if (!prev.has(scenario.id)) return prev
      const next = new Set(prev)
      next.delete(scenario.id)
      return next
    })
  }, [])

  const onActivate = useCallback(() => {
    if (!actions || activeId == null) return
    void actions.activateScenario(activeId)
  }, [actions, activeId])

  // Loading another scenario replaces the draft, so unsaved edits are held back behind a
  // question. Held as its own value so the sheet keeps its text while it animates out.
  const [pendingSelect, setPendingSelect] = useState<GoalScenario | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const onSelectScenario = useCallback(
    (scenario: GoalScenario) => {
      if (scenario.id === activeId) return
      if (dirty || detachedEdits) {
        setPendingSelect(scenario)
        setDiscardOpen(true)
        return
      }
      selectScenario(scenario)
    },
    [activeId, dirty, detachedEdits, selectScenario],
  )
  const onDiscardAndSelect = useCallback(() => {
    setDiscardOpen(false)
    if (pendingSelect) selectScenario(pendingSelect)
  }, [pendingSelect, selectScenario])

  // Switching to the unsaved draft keeps the current edits, so it needs no question.
  const onSelectEditing = useCallback(() => {
    setActiveId(null)
  }, [])

  const onSaveChanges = useCallback(() => {
    if (!actions || activeId == null) return
    void actions.updateScenario(activeId, draft)
  }, [actions, activeId, draft])

  const onDiscard = useCallback(() => {
    if (activeScenario) setDraft(scenarioToDraft(activeScenario))
  }, [activeScenario])

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

  const onToggleVisible = useCallback((id: number) => {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const onSaveDraft = useCallback(
    async (name: string) => {
      if (!actions) return
      const scenario = await actions.createScenario({
        ...draft,
        name,
        sortOrder: dataset.goalScenarios.length,
      })
      selectScenario(scenario)
    },
    [actions, draft, dataset.goalScenarios, selectScenario],
  )

  const handleSaveDraft = useCallback(
    (name: string) => {
      void onSaveDraft(name)
    },
    [onSaveDraft],
  )

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

      <div className={progressStyles.viewSwitcherRow}>
        <SegmentedControl
          options={VIEW_OPTIONS}
          value={view}
          onChange={changeView}
          ariaLabel="Goals view"
          layout="compact"
        />
      </div>

      {view === 'setup' ? (
        <SetupView
          accounts={dataset.wealthAccounts}
          checkins={dataset.wealthCheckins}
          settings={dataset.settings}
          actions={actions}
          onSettingsChange={actions ? (patch) => actions.updateSettings(patch) : undefined}
          focusInflation={focusInflation}
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
          onOpenSetup={() => changeView('setup')}
          openCheckinForm={checkinEntry}
          cashReserveMonths={dataset.settings.cashReserveMonths}
          openBudgetMonth={defaultBudgetMonth(todayIso(), dataset.settings.budgetRolloverDay)}
          onRebaseline={onRebaseline}
        />
        </>
      ) : null}
      {view === 'plan' ? (
        <>
          <p className={styles.intro}>
            Project your net worth and financial independence under different assumptions. Horizon
            sets how far the projection runs and where FI is searched. Adjust the controls, save a
            scenario, then compare scenarios on the charts.
          </p>
          <GoalsExplainer />
          <div className={styles.mobilePlanToggleRow}>
            <SegmentedControl
              options={MOBILE_PLAN_VIEW_OPTIONS}
              value={mobilePlanView}
              onChange={setMobilePlanView}
              ariaLabel="Plan mobile view"
              layout="compact"
            />
          </div>
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
              onSelect={onSelectScenario}
              onSelectEditing={onSelectEditing}
              onToggleVisible={onToggleVisible}
              onPatch={patchDraft}
              onSaveDraft={handleSaveDraft}
              onSaveChanges={onSaveChanges}
              onDiscard={onDiscard}
              onActivate={onActivate}
              onScenarioCreated={selectScenario}
            />
            <DiscardSheet
              pending={pendingSelect}
              open={discardOpen}
              detached={activeId === null}
              name={activeScenario?.name ?? draft.name}
              onConfirm={onDiscardAndSelect}
              onCancel={() => setDiscardOpen(false)}
            />
          </div>
          {mobilePlanView === 'adjust' ? (
            // Phone only: the toggle is hidden on desktop, so this never mounts there.
            <div className={styles.areaMini}>
              <NetWorthMiniChart draft={deferredDraft} />
            </div>
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
                      onChange={setDisplayMode}
                      ariaLabel="Value display mode"
                      layout="compact"
                    />
                  </div>
                  {displayMode === 'nominal' ? (
                    <p className={styles.chartHint}>
                      Nominal inflates the plan line and its band at the assumed inflation,{' '}
                      {formatPercent(dataset.settings.assumedInflation, format)} a year, which is set in Setup. The
                      summary, the FI target and the milestones stay in today&apos;s money, so the target lines
                      are only drawn in Purchasing power.
                      {actions ? (
                        <>
                          {' '}
                          <button type="button" className={styles.btnText} onClick={openInflationSetting}>
                            Open Setup
                          </button>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </>
              }
              extraSeries={checkinExtraSeries ? [checkinExtraSeries] : []}
              nominalMode={displayMode === 'nominal'}
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
            />
          </div>
        </div>
      </div>
        </>
      ) : null}
    </div>
  )
}

export default GoalsTab
