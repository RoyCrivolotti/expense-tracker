import type { GoalScenario } from '../../../types'
import type { ExpenseActions } from '../../actions'
import { duplicateScenario } from '../../../engine'
import { Card } from '../../components/primitives'
import styles from './goals.module.css'

interface ScenarioManagerProps {
  scenarios: GoalScenario[]
  activeId: number | null
  editingName: string
  canWrite: boolean
  actions?: ExpenseActions | undefined
  onSelect: (scenario: GoalScenario) => void
  onSelectEditing: () => void
  onSaveDraft: () => void
}

function shortName(name: string): string {
  const colon = name.indexOf(':')
  return colon >= 0 ? name.slice(0, colon).trim() : name
}

export function ScenarioManager({
  scenarios,
  activeId,
  editingName,
  canWrite,
  actions,
  onSelect,
  onSelectEditing,
  onSaveDraft,
}: ScenarioManagerProps) {
  const activeScenario = scenarios.find((s) => s.id === activeId)

  return (
    <Card>
      <h3 className={styles.sectionTitle}>Comparison lines</h3>
      <div className={styles.chipRow} role="tablist" aria-label="Scenarios">
        <button
          type="button"
          role="tab"
          aria-selected={activeId === null}
          className={`${styles.chip}${activeId === null ? ` ${styles.chipActive}` : ''}`}
          onClick={onSelectEditing}
        >
          Editing
        </button>
        {scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={activeId === s.id}
            className={`${styles.chip}${activeId === s.id ? ` ${styles.chipActive}` : ''}`}
            onClick={() => onSelect(s)}
          >
            <span className={styles.swatch} style={{ background: s.color }} aria-hidden />
            {shortName(s.name)}
          </button>
        ))}
      </div>
      {activeScenario && canWrite && actions ? (
        <div className={styles.scenarioToolbar}>
          <span className={styles.scenarioFullName}>{activeScenario.name}</span>
          <span className={styles.scenarioActions}>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label={`Duplicate ${activeScenario.name}`}
              onClick={() => {
                const copy = duplicateScenario(activeScenario, scenarios.length)
                void actions.createScenario(copy)
              }}
            >
              ⧉
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label={`Delete ${activeScenario.name}`}
              onClick={() => void actions.deleteScenario(activeScenario.id)}
            >
              ×
            </button>
          </span>
        </div>
      ) : null}
      {activeId === null ? (
        <p className={styles.chartHint}>Editing &ldquo;{editingName}&rdquo; — changes update charts live.</p>
      ) : null}
      {canWrite && actions ? (
        <div className={styles.btnRow}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onSaveDraft}>
            Save current as line
          </button>
        </div>
      ) : null}
      {!canWrite ? (
        <p className={styles.chartHint}>Read-only session — scenarios cannot be saved.</p>
      ) : null}
    </Card>
  )
}
