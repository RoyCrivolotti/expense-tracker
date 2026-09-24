import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import type { ExpenseModel } from '../../useExpenseData'
import type { ExpenseActions } from '../../actions'
import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import {
  averageMonthlyCents,
  computeMonthlyTotals,
  monthlyFlows,
  yearOffsetFromDate,
  checkinInvestedCents,
  latestCheckin,
  milestonesReached,
} from '../../../engine'
import type { InvestedSnapshot } from './checkinDate'
import type { ChartSeries } from '../../charts/LinearChart'
import { Card, SectionTitle } from '../../components/primitives'
import { SegmentedControl } from '../../components/SegmentedControl'
import { PercentStepper } from '../../components/PercentStepper'
import { ConfirmSheet } from '../../components/ConfirmSheet'
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

function bootstrapEditor(
  dataset: ExpenseModel['dataset'],
  avgSaving: number,
): { activeId: number | null; draft: NewGoalScenario } {
  const first = initialEditorScenario(dataset.goalScenarios)
  if (first) return { activeId: first.id, draft: scenarioToDraft(first) }
  return { activeId: null, draft: draftFromDataset(dataset, avgSaving) }
}

function initialView(entry: GoalsEntry | undefined): TabView {
  return entry === 'checkin' ? 'progress' : 'plan'
}

export function GoalsTab({ model, actions, entry }: GoalsTabProps) {
  const { dataset } = model
  const [view, setView] = useState<TabView>(() => initialView(entry))
  const [displayMode, setDisplayMode] = useState<DisplayMode>('nominal')
  // Single configurable rate rather than year-by-year inputs — a reasonable
  // simplification for a multi-decade projection. Resets on reload; display-only.
  const [nominalInflation, setNominalInflation] = useState(0.02)
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

  const dirty = useMemo(() => {
    if (!activeScenario) return false
    if (draft.name !== activeScenario.name) return true
    if (JSON.stringify(draft.lifeEvents) !== JSON.stringify(activeScenario.lifeEvents)) return true
    return EDIT_KEYS.some((k) => draft[k] !== activeScenario[k])
  }, [activeScenario, draft])

  const selectScenario = useCallback((scenario: GoalScenario) => {
    setActiveId(scenario.id)
    setDraft(scenarioToDraft(scenario))
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
      if (dirty) {
        setPendingSelect(scenario)
        setDiscardOpen(true)
        return
      }
      selectScenario(scenario)
    },
    [activeId, dirty, selectScenario],
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

  const visibleScenarios = useMemo(
    () => dataset.goalScenarios.filter((s) => !hiddenIds.has(s.id)),
    [dataset.goalScenarios, hiddenIds],
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
          onChange={setView}
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
        />
      ) : null}
      {view === 'progress' ? (
        <ProgressView
          accounts={dataset.wealthAccounts}
          checkins={dataset.wealthCheckins}
          transactions={dataset.transactions}
          milestones={milestones}
          reached={reachedMilestones}
          plan={plan}
          actions={actions}
          canWrite={actions != null}
          onOpenSetup={() => setView('setup')}
          openCheckinForm={entry === 'checkin'}
          cashReserveMonths={dataset.settings.cashReserveMonths}
        />
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
            <Presence show={discardOpen} exitMs={EXIT_MS.sheet}>
              {pendingSelect ? (
                <ConfirmSheet
                  title={`Discard unsaved changes to ${activeScenario?.name ?? draft.name}?`}
                  message={`Loading ${pendingSelect.name} drops the edits made here. Save changes first to keep them.`}
                  confirmLabel="Discard"
                  destructive
                  onConfirm={onDiscardAndSelect}
                  onCancel={() => setDiscardOpen(false)}
                />
              ) : null}
            </Presence>
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
              scenarios={visibleScenarios}
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
                  {displayMode === 'purchasing-power' ? (
                    <div className={progressStyles.inflationRow}>
                      <span className={progressStyles.inflationLabel}>Inflation assumed</span>
                      <PercentStepper
                        value={nominalInflation}
                        onChange={setNominalInflation}
                        min={0}
                        max={0.1}
                        ariaLabel="Inflation rate percentage"
                      />
                    </div>
                  ) : null}
                </>
              }
              extraSeries={checkinExtraSeries ? [checkinExtraSeries] : []}
              realMode={displayMode === 'purchasing-power'}
              inflationRate={nominalInflation}
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
