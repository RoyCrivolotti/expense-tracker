import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import type { ExpenseModel } from '../../useExpenseData'
import type { ExpenseActions } from '../../actions'
import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import { averageMonthlySaving, computeMonthlyTotals } from '../../../engine'
import { Card, SectionTitle } from '../../components/primitives'
import { GoalControls } from './GoalControls'
import { ScenarioManager } from './ScenarioManager'
import { GoalsExplainer } from './GoalsExplainer'
import { GoalsNarrative } from './GoalsNarrative'
import { SecondaryCharts } from './SecondaryCharts'
import { draftFromDataset } from './goalsDefaults'
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

  const initialDraft = useMemo(
    () => draftFromDataset(dataset, avgSaving),
    [dataset, avgSaving],
  )

  const [draft, setDraft] = useState<NewGoalScenario>(initialDraft)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<number>>(() => new Set())
  // Controls read `draft` (instant); charts read the deferred copy so dragging a
  // slider never blocks on the projection recompute (keeps the thumb at 60fps).
  const deferredDraft = useDeferredValue(draft)

  const patchDraft = useCallback((patch: Partial<NewGoalScenario>) => {
    setActiveId(null)
    setDraft((prev) => ({ ...prev, ...patch }))
  }, [])

  const onSelectScenario = useCallback((scenario: GoalScenario) => {
    setActiveId(scenario.id)
    setDraft(scenarioToDraft(scenario))
  }, [])

  const onSelectEditing = useCallback(() => {
    setActiveId(null)
  }, [])

  const onToggleVisible = useCallback((id: number) => {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const onSaveDraft = useCallback(
    (name: string) => {
      if (!actions) return
      void actions.createScenario({ ...draft, name, sortOrder: dataset.goalScenarios.length })
    },
    [actions, draft, dataset.goalScenarios.length],
  )

  const visibleScenarios = useMemo(
    () => dataset.goalScenarios.filter((s) => !hiddenIds.has(s.id)),
    [dataset.goalScenarios, hiddenIds],
  )

  return (
    <div className={styles.stack}>
      <SectionTitle>Goals</SectionTitle>
      <p className={styles.intro}>
        Project your net worth and financial independence under different assumptions. Adjust the
        controls to model a future, save it as a scenario, then compare scenarios on the charts.
      </p>
      <GoalsExplainer />
      <div className={styles.layout}>
        <div className={styles.chartsColumn}>
          <NetWorthNowCard draft={deferredDraft} />
          <div className={styles.heroBlock}>
            <NetWorthChart
              scenarios={visibleScenarios}
              draft={deferredDraft}
              variant="hero"
            />
            <GoalsNarrative draft={deferredDraft} compact />
          </div>
          <SecondaryCharts
            scenarios={dataset.goalScenarios}
            draft={deferredDraft}
            monthly={monthly}
          />
        </div>
        <div className={styles.controlsColumn}>
          <ScenarioManager
            scenarios={dataset.goalScenarios}
            activeId={activeId}
            draftName={draft.name}
            hiddenIds={hiddenIds}
            canWrite={actions != null}
            actions={actions}
            onSelect={onSelectScenario}
            onSelectEditing={onSelectEditing}
            onToggleVisible={onToggleVisible}
            onSaveDraft={onSaveDraft}
          />
          <Card>
            <GoalControls draft={draft} onChange={patchDraft} />
          </Card>
        </div>
      </div>
    </div>
  )
}

export default GoalsTab
