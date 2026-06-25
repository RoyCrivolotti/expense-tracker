import { useState } from 'react'
import type { GoalScenario } from '../../../types'
import type { ExpenseActions } from '../../actions'
import { duplicateScenario } from '../../../engine'
import styles from './goals.module.css'

interface ScenarioToolbarProps {
  scenario: GoalScenario
  scenarioCount: number
  usedColors: readonly string[]
  actions: ExpenseActions
  onScenarioCreated: (scenario: GoalScenario) => void
}

/**
 * Rename / duplicate / delete for the saved scenario currently loaded in the
 * editor. Mounted with a `key` of the scenario id so the rename field resets
 * cleanly when a different scenario is selected.
 */
export function ScenarioToolbar({
  scenario,
  scenarioCount,
  usedColors,
  actions,
  onScenarioCreated,
}: ScenarioToolbarProps) {
  const [name, setName] = useState(scenario.name)

  const commitName = () => {
    const next = name.trim()
    if (next && next !== scenario.name) void actions.updateScenario(scenario.id, { name: next })
    else setName(scenario.name)
  }

  return (
    <div className={styles.scenarioToolbar}>
      <input
        className={styles.renameInput}
        value={name}
        aria-label={`Rename ${scenario.name}`}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      <span className={styles.scenarioActions}>
        <button
          type="button"
          className={styles.btn}
          onClick={() => {
            void actions
              .createScenario(duplicateScenario(scenario, scenarioCount, usedColors))
              .then(onScenarioCreated)
          }}
        >
          Duplicate
        </button>
        <button
          type="button"
          className={styles.btn}
          onClick={() => void actions.deleteScenario(scenario.id)}
        >
          Delete
        </button>
      </span>
    </div>
  )
}
