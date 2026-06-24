import { useCallback, useMemo, useState } from 'react'
import type { ExpenseModel } from '../../useExpenseData'
import type { ExpenseActions } from '../../actions'
import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import { averageMonthlySaving, computeMonthlyTotals } from '../../../engine'
import { Card, SectionTitle } from '../../components/primitives'
import { GoalControls } from './GoalControls'
import { ScenarioManager } from './ScenarioManager'
import { GoalsNarrative } from './GoalsNarrative'
import { draftFromDataset } from './goalsDefaults'
import { NetWorthChart } from './charts/NetWorthChart'
import { CompositionChart } from './charts/CompositionChart'
import { MilestoneMatrix } from './charts/MilestoneMatrix'
import { FireChart } from './charts/FireChart'
import { RentVsOwnChart } from './charts/RentVsOwnChart'
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

  const patchDraft = useCallback((patch: Partial<NewGoalScenario>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
  }, [])

  const onSelectScenario = useCallback((scenario: GoalScenario) => {
    setActiveId(scenario.id)
    setDraft(scenarioToDraft(scenario))
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
      <GoalsNarrative draft={draft} />
      <div className={styles.grid2}>
        <div className={styles.panel}>
          <Card>
            <GoalControls draft={draft} onChange={patchDraft} />
          </Card>
          <ScenarioManager
            scenarios={dataset.goalScenarios}
            activeId={activeId}
            canWrite={actions != null}
            actions={actions}
            onSelect={onSelectScenario}
            onSaveDraft={onSaveDraft}
          />
        </div>
        <div className={styles.panel}>
          <NetWorthChart scenarios={dataset.goalScenarios} draft={draft} />
          <CompositionChart draft={draft} />
          <MilestoneMatrix scenarios={dataset.goalScenarios} draft={draft} />
          <FireChart draft={draft} />
          <RentVsOwnChart draft={draft} />
        </div>
      </div>
    </div>
  )
}

export default GoalsTab
