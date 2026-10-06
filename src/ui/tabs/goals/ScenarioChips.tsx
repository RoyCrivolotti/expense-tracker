import type { GoalScenario } from '../../../types'
import { scenarioInk } from './scenarioInk'
import styles from './goals.module.css'

interface ScenarioChipsProps {
  scenarios: GoalScenario[]
  activeId: number | null
  hiddenIds: ReadonlySet<number>
  /** The scenarios that keep their own start while the others are looked at from the latest check-in. */
  ownStartIds?: ReadonlySet<number>
  onSelect: (s: GoalScenario) => void
  onSelectEditing: () => void
  onToggleVisible: (id: number) => void
}

const NO_IDS: ReadonlySet<number> = new Set()

export function ScenarioChips({
  scenarios,
  activeId,
  hiddenIds,
  ownStartIds = NO_IDS,
  onSelect,
  onSelectEditing,
  onToggleVisible,
}: ScenarioChipsProps) {
  return (
    <div className={styles.scenarioChipRow} role="group" aria-label="Scenarios">
      <button
        type="button"
        aria-pressed={activeId === null}
        className={`${styles.chip}${activeId === null ? ` ${styles.chipActive}` : ''}`}
        onClick={onSelectEditing}
      >
        Unsaved draft
      </button>
      {scenarios.map((s) => {
        const hidden = hiddenIds.has(s.id)
        const label = s.name
        return (
          <span
            key={s.id}
            className={`${styles.chipGroup}${activeId === s.id ? ` ${styles.chipActive}` : ''}${
              hidden ? ` ${styles.chipHidden}` : ''
            }`}
          >
            <button
              type="button"
              aria-pressed={activeId === s.id}
              className={styles.chipSelect}
              onClick={() => onSelect(s)}
            >
              {/* Its own line, above the name, so it never wraps mid-word beside a long title. */}
              {s.isActive ? <span className={styles.chipTag}>Current plan</span> : null}
              {ownStartIds.has(s.id) ? <span className={styles.chipTag}>Own start</span> : null}
              <span className={styles.chipTitle}>
                <span className={styles.swatch} style={{ background: scenarioInk(s.color) }} aria-hidden />
                {label}
              </span>
            </button>
            <button
              type="button"
              className={styles.chipEye}
              aria-pressed={!hidden}
              aria-label={hidden ? `Show ${label} on chart` : `Hide ${label} on chart`}
              // The loaded scenario is always drawn as the editing line, so hiding it
              // would change nothing on the chart.
              disabled={activeId === s.id}
              title={activeId === s.id ? 'Always shown while loaded' : hidden ? 'Hidden on chart' : 'Shown on chart'}
              onClick={() => onToggleVisible(s.id)}
            >
              {hidden ? '○' : '●'}
            </button>
          </span>
        )
      })}
    </div>
  )
}
