import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import type { ExpenseModel } from '../../useExpenseData'
import type { ExpenseActions } from '../../actions'
import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import {
  averageMonthlySaving,
  computeMonthlyTotals,
  yearOffsetFromDate,
  checkinInvestedCents,
} from '../../../engine'
import type { ChartSeries } from '../../charts/LinearChart'
import { Card, SectionTitle } from '../../components/primitives'
import { SegmentedControl } from '../../components/SegmentedControl'
import { GoalControls } from './GoalControls'
import { ScenarioManager } from './ScenarioManager'
import { GoalsExplainer } from './GoalsExplainer'
import { GoalsNarrative } from './GoalsNarrative'
import { SecondaryCharts } from './SecondaryCharts'
import { ProgressView } from './ProgressView'
import { draftFromDataset } from './goalsDefaults'
import { lastAddedScenario, writePinnedScenarioId } from './scenarioSelection'
import { NetWorthChart } from './charts/NetWorthChart'
import { NetWorthNowCard } from './charts/NetWorthNowCard'
import type { MonthlySaving } from './charts/SavingsRateChart'
import styles from './goals.module.css'
import progressStyles from './progress.module.css'

type TabView = 'plan' | 'progress'
type DisplayMode = 'real' | 'nominal'

const VIEW_OPTIONS: { value: TabView; label: string }[] = [
  { value: 'plan', label: 'Plan' },
  { value: 'progress', label: 'Progress' },
]

const DISPLAY_MODE_OPTIONS: { value: DisplayMode; label: string }[] = [
  { value: 'real', label: 'Real' },
  { value: 'nominal', label: 'Nominal' },
]

interface GoalsTabProps {
  model: ExpenseModel
  actions?: ExpenseActions | undefined
}

function scenarioToDraft(s: GoalScenario): NewGoalScenario {
  const { id, ...rest } = s
  void id
  return rest
}

// Fields the controls can change; used to detect unsaved edits to a saved plan.
const EDIT_KEYS = [
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
  const last = lastAddedScenario(dataset.goalScenarios)
  if (last) {
    writePinnedScenarioId(last.id)
    return { activeId: last.id, draft: scenarioToDraft(last) }
  }
  return { activeId: null, draft: draftFromDataset(dataset, avgSaving) }
}

export function GoalsTab({ model, actions }: GoalsTabProps) {
  const { dataset } = model
  const [view, setView] = useState<TabView>('plan')
  const [displayMode, setDisplayMode] = useState<DisplayMode>('real')
  const monthly = useMemo<MonthlySaving[]>(() => {
    const entries = [...computeMonthlyTotals(dataset.transactions).entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )
    return entries.map(([month, t]) => ({ month, netSavingCents: t.netSavingCents }))
  }, [dataset.transactions])
  const avgSaving = useMemo(
    () => averageMonthlySaving(monthly.map((m) => m.netSavingCents)),
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

  const activeScenario = useMemo(
    () => dataset.goalScenarios.find((s) => s.id === activeId) ?? null,
    [dataset.goalScenarios, activeId],
  )

  const dirty = useMemo(() => {
    if (!activeScenario) return false
    if (draft.name !== activeScenario.name) return true
    if (JSON.stringify(draft.lifeEvents) !== JSON.stringify(activeScenario.lifeEvents)) return true
    return EDIT_KEYS.some((k) => draft[k] !== activeScenario[k])
  }, [activeScenario, draft])

  const selectScenario = useCallback((scenario: GoalScenario) => {
    setActiveId(scenario.id)
    setDraft(scenarioToDraft(scenario))
    writePinnedScenarioId(scenario.id)
  }, [])

  const onSelectScenario = selectScenario

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

      {view === 'progress' ? (
        <ProgressView
          accounts={dataset.wealthAccounts}
          checkins={dataset.wealthCheckins}
          activeScenario={activeScenario}
          actions={actions}
          canWrite={actions != null}
        />
      ) : (
        <>
          <p className={styles.intro}>
            Project your net worth and financial independence under different assumptions. Horizon
            sets how far the projection runs and where FI is searched. Adjust the controls, save a
            scenario, then compare scenarios on the charts.
          </p>
          <GoalsExplainer />
          <div className={styles.layout}>
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
              onScenarioCreated={selectScenario}
            />
          </div>
          <div className={styles.areaControls}>
            <Card>
              <GoalControls draft={draft} onChange={patchDraft} />
            </Card>
          </div>
        </div>
        <div className={styles.areaOutputs}>
          <div className={styles.areaNow}>
            <NetWorthNowCard draft={deferredDraft} />
          </div>
          <div className={`${styles.heroBlock} ${styles.areaHero}`}>
            <NetWorthChart
              scenarios={visibleScenarios}
              draft={deferredDraft}
              activeId={activeId}
              dirty={dirty}
              variant="hero"
              footer={
                <>
                  <GoalsNarrative draft={deferredDraft} compact />
                  <div className={progressStyles.displayModeRow}>
                    <SegmentedControl
                      options={DISPLAY_MODE_OPTIONS}
                      value={displayMode}
                      onChange={setDisplayMode}
                      ariaLabel="Value display mode"
                      layout="compact"
                    />
                  </div>
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
            />
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  )
}

export default GoalsTab
