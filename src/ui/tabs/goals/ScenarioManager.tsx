import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import type { ExpenseActions } from '../../actions'
import { Card } from '../../components/primitives'
import { ActiveScenarioHeader } from './ActiveScenarioHeader'
import { ScenarioChips } from './ScenarioChips'
import styles from './goals.module.css'

interface ScenarioManagerProps {
  scenarios: GoalScenario[]
  activeId: number | null
  draft: NewGoalScenario
  hiddenIds: ReadonlySet<number>
  canWrite: boolean
  actions?: ExpenseActions | undefined
  dirty: boolean
  onSelect: (scenario: GoalScenario) => void
  onSelectEditing: () => void
  onToggleVisible: (id: number) => void
  onPatch: (patch: Partial<NewGoalScenario>) => void
  onSaveDraft: (name: string) => void
  onSaveChanges: () => void
  onDiscard: () => void
  onScenarioCreated: (scenario: GoalScenario) => void
}

export function ScenarioManager(props: ScenarioManagerProps) {
  const { scenarios, activeId, hiddenIds, canWrite, actions, draft, dirty } = props
  const activeScenario = scenarios.find((s) => s.id === activeId) ?? null

  return (
    <Card className={styles.scenarioCard}>
      <h3 className={styles.sectionTitle}>Scenarios</h3>
      <p className={styles.chartHint}>
        Each colored line on the projection is a saved scenario. Tap one to load it into the editor
        below, toggle its dot to show or hide it, or save your current draft to compare.
      </p>
      <ScenarioChips
        scenarios={scenarios}
        activeId={activeId}
        hiddenIds={hiddenIds}
        onSelect={props.onSelect}
        onSelectEditing={props.onSelectEditing}
        onToggleVisible={props.onToggleVisible}
      />
      {scenarios.length === 0 ? (
        <p className={styles.emptyState}>
          No saved scenarios yet. Tune the controls below, give it a name, and save it to start
          comparing.
        </p>
      ) : null}
      <ActiveScenarioHeader
        draft={draft}
        activeScenario={activeScenario}
        scenarioCount={scenarios.length}
        usedColors={scenarios.map((s) => s.color)}
        dirty={dirty}
        canWrite={canWrite}
        actions={actions}
        onPatch={props.onPatch}
        onSaveChanges={props.onSaveChanges}
        onDiscard={props.onDiscard}
        onSaveDraft={props.onSaveDraft}
        onScenarioCreated={props.onScenarioCreated}
      />
    </Card>
  )
}
