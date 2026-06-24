import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import type { ExpenseModel } from '../../useExpenseData'
import type { ExpenseActions } from '../../actions'
import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import { averageMonthlySaving, computeMonthlyTotals } from '../../../engine'
import { Card, SectionTitle } from '../../components/primitives'
import { GoalControls } from './GoalControls'
import { ScenarioManager } from './ScenarioManager'
import { GoalsNarrative } from './GoalsNarrative'
import { SecondaryCharts } from './SecondaryCharts'
import { draftFromDataset } from './goalsDefaults'
import { NetWorthChart } from './charts/NetWorthChart'
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
  const avgSaving = useMemo(() => {
    const totals = [...computeMonthlyTotals(dataset.transactions).values()]
    return averageMonthlySaving(totals.map((t) => t.netSavingCents))
  }, [dataset.transactions])

  const initialDraft = useMemo(
    () => draftFromDataset(dataset, avgSaving),
    [dataset, avgSaving],
  )

  const [draft, setDraft] = useState<NewGoalScenario>(initialDraft)
  const [activeId, setActiveId] = useState<number | null>(null)
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

  const onSaveDraft = useCallback(() => {
    if (!actions) return
    void actions.createScenario({
      ...draft,
      sortOrder: dataset.goalScenarios.length,
    })
  }, [actions, draft, dataset.goalScenarios.length])

  return (
    <div className={styles.stack}>
      <SectionTitle>Goals</SectionTitle>
      <div className={styles.layout}>
        <div className={styles.chartsColumn}>
          <div className={styles.heroBlock}>
            <NetWorthChart
              scenarios={dataset.goalScenarios}
              draft={deferredDraft}
              variant="hero"
            />
            <GoalsNarrative draft={deferredDraft} compact />
          </div>
          <SecondaryCharts scenarios={dataset.goalScenarios} draft={deferredDraft} />
        </div>
        <div className={styles.controlsColumn}>
          <ScenarioManager
            scenarios={dataset.goalScenarios}
            activeId={activeId}
            editingName={draft.name}
            canWrite={actions != null}
            actions={actions}
            onSelect={onSelectScenario}
            onSelectEditing={onSelectEditing}
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
