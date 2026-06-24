import type { GoalScenario } from '../../../types'
import type { ExpenseActions } from '../../actions'
import { duplicateScenario } from '../../../engine'
import { Card } from '../../components/primitives'
import styles from './goals.module.css'

interface ScenarioManagerProps {
  scenarios: GoalScenario[]
  activeId: number | null
  canWrite: boolean
  actions?: ExpenseActions | undefined
  onSelect: (scenario: GoalScenario) => void
  onSaveDraft: () => void
}

export function ScenarioManager({
  scenarios,
  activeId,
  canWrite,
  actions,
  onSelect,
  onSaveDraft,
}: ScenarioManagerProps) {
  return (
    <Card>
      <h3 className={styles.sectionTitle}>Comparison lines</h3>
      <ul className={styles.scenarioList}>
        {scenarios.map((s) => (
          <li
            key={s.id}
            className={`${styles.scenarioItem}${activeId === s.id ? ` ${styles.scenarioItemActive}` : ''}`}
          >
            <span className={styles.swatch} style={{ background: s.color }} />
            <button type="button" className={styles.scenarioName} onClick={() => onSelect(s)}>
              {s.name}
            </button>
            {canWrite && actions ? (
              <span className={styles.scenarioActions}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={`Duplicate ${s.name}`}
                  onClick={() => {
                    const copy = duplicateScenario(s, scenarios.length)
                    void actions.createScenario(copy)
                  }}
                >
                  ⧉
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={`Delete ${s.name}`}
                  onClick={() => void actions.deleteScenario(s.id)}
                >
                  ×
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
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
