import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import type { ExpenseModel } from '../../useExpenseData'
import type { ExpenseActions } from '../../actions'
import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import { averageMonthlySaving, computeMonthlyTotals, pickScenarioColor } from '../../../engine'
import { Card, SectionTitle } from '../../components/primitives'
import { GoalControls } from './GoalControls'
import { ScenarioManager } from './ScenarioManager'
import { GoalsExplainer } from './GoalsExplainer'
import { GoalsNarrative } from './GoalsNarrative'
import { SecondaryCharts } from './SecondaryCharts'
import { draftFromDataset } from './goalsDefaults'
import { lastAddedScenario, writePinnedScenarioId } from './scenarioSelection'
import { NetWorthChart } from './charts/NetWorthChart'
import { NetWorthNowCard } from './charts/NetWorthNowCard'
import type { MonthlySaving } from './charts/SavingsRateChart'
import styles from './goals.module.css'

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
  'expectedRealReturn',
  'horizonYears',
  'housePriceCents',
  'downPaymentFraction',
  'housePurchaseYear',
  'transactionCostsCents',
  'rentMonthlyCents',
  'annualSpendCents',
  'safeWithdrawalRate',
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
        color: pickScenarioColor(dataset.goalScenarios.map((s) => s.color)),
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

  return (
    <div className={styles.stack}>
      <SectionTitle>Goals</SectionTitle>
      <p className={styles.intro}>
        Project your net worth and financial independence under different assumptions. Horizon sets
        how far the projection runs and where FI is searched. Adjust the controls, save a scenario,
        then compare scenarios on the charts.
      </p>
      <GoalsExplainer />
      <div className={styles.layout}>
        <div className={styles.areaSidebar}>
          <div className={styles.areaScenarios}>
            <ScenarioManager
              scenarios={dataset.goalScenarios}
              activeId={activeId}
              draftName={draft.name}
              hiddenIds={hiddenIds}
              canWrite={actions != null}
              actions={actions}
              dirty={dirty}
              onSelect={onSelectScenario}
              onSelectEditing={onSelectEditing}
              onToggleVisible={onToggleVisible}
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
              footer={<GoalsNarrative draft={deferredDraft} compact />}
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
    </div>
  )
}

export default GoalsTab
