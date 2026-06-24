import { useState } from 'react'
import type { GoalScenario } from '../../../types'
import type { ExpenseActions } from '../../actions'
import { Card } from '../../components/primitives'
import { ScenarioChips } from './ScenarioChips'
import { ScenarioToolbar } from './ScenarioToolbar'
import styles from './goals.module.css'

interface ScenarioManagerProps {
  scenarios: GoalScenario[]
  activeId: number | null
  draftName: string
  hiddenIds: ReadonlySet<number>
  canWrite: boolean
  actions?: ExpenseActions | undefined
  onSelect: (scenario: GoalScenario) => void
  onSelectEditing: () => void
  onToggleVisible: (id: number) => void
  onSaveDraft: (name: string) => void
}

export function ScenarioManager(props: ScenarioManagerProps) {
  const { scenarios, activeId, draftName, hiddenIds, canWrite, actions } = props
  const activeScenario = scenarios.find((s) => s.id === activeId)
  // Default the save field to the draft name, following it as the draft changes
  // (React's "store previous prop" pattern — no effect, no cascading render).
  const [saveName, setSaveName] = useState(draftName)
  const [seenDraftName, setSeenDraftName] = useState(draftName)
  if (draftName !== seenDraftName) {
    setSeenDraftName(draftName)
    setSaveName(draftName)
  }

  return (
    <Card>
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
      {activeScenario && canWrite && actions ? (
        <ScenarioToolbar
          key={activeScenario.id}
          scenario={activeScenario}
          scenarioCount={scenarios.length}
          actions={actions}
        />
      ) : null}
      {activeId === null ? (
        <p className={styles.chartHint}>
          Editing an unsaved draft — changes update the charts live but are not stored until you
          save.
        </p>
      ) : null}
      {canWrite ? (
        <div className={styles.saveRow}>
          <input
            className={styles.renameInput}
            value={saveName}
            aria-label="Name for new scenario"
            placeholder="Scenario name"
            onChange={(e) => setSaveName(e.target.value)}
          />
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={saveName.trim().length === 0}
            onClick={() => props.onSaveDraft(saveName.trim())}
          >
            Save as scenario
          </button>
        </div>
      ) : (
        <p className={styles.chartHint}>Read-only session — scenarios cannot be saved.</p>
      )}
    </Card>
  )
}
