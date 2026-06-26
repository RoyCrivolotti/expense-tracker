import { useState } from 'react'
import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import type { ExpenseActions } from '../../actions'
import { duplicateScenario } from '../../../engine'
import { ScenarioColorPicker } from './ScenarioColorPicker'
import styles from './goals.module.css'

interface ActiveScenarioHeaderProps {
  draft: NewGoalScenario
  activeScenario: GoalScenario | null
  scenarioCount: number
  usedColors: readonly string[]
  dirty: boolean
  canWrite: boolean
  actions?: ExpenseActions | undefined
  onPatch: (patch: Partial<NewGoalScenario>) => void
  onSaveChanges: () => void
  onDiscard: () => void
  onSaveDraft: (name: string) => void
  onScenarioCreated: (scenario: GoalScenario) => void
}

export function ActiveScenarioHeader({
  draft,
  activeScenario,
  scenarioCount,
  usedColors,
  dirty,
  canWrite,
  actions,
  onPatch,
  onSaveChanges,
  onDiscard,
  onSaveDraft,
  onScenarioCreated,
}: ActiveScenarioHeaderProps) {
  const [saveAsNewOpen, setSaveAsNewOpen] = useState(false)
  const [copyName, setCopyName] = useState(`${draft.name} copy`)

  if (!canWrite) {
    return <p className={styles.chartHint}>Read-only session — scenarios cannot be saved.</p>
  }

  const onColorChange = (color: string) => {
    onPatch({ color })
    if (activeScenario && actions) {
      void actions.updateScenario(activeScenario.id, { color })
    }
  }

  const openSaveAsNew = () => {
    setCopyName(`${draft.name} copy`)
    setSaveAsNewOpen(true)
  }

  return (
    <div className={styles.activeHeader}>
      <div className={styles.activeHeaderTop}>
        <ScenarioColorPicker color={draft.color} onChange={onColorChange} />
        <input
          className={styles.renameInput}
          value={draft.name}
          aria-label="Scenario name"
          placeholder="Scenario name"
          onChange={(e) => onPatch({ name: e.target.value })}
        />
      </div>

      {activeScenario ? (
        <>
          {dirty ? <span className={styles.dirtyPill}>Unsaved changes</span> : null}
          <div className={styles.btnRow}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={!dirty}
              onClick={onSaveChanges}
            >
              Save changes
            </button>
            <button type="button" className={styles.btn} disabled={!dirty} onClick={onDiscard}>
              Discard
            </button>
            {actions ? (
              <>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() => {
                    void actions
                      .createScenario(duplicateScenario(draft, scenarioCount, usedColors))
                      .then(onScenarioCreated)
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() => void actions.deleteScenario(activeScenario.id)}
                >
                  Delete
                </button>
              </>
            ) : null}
          </div>
          {!saveAsNewOpen ? (
            <button type="button" className={styles.btnText} onClick={openSaveAsNew}>
              Save as new scenario…
            </button>
          ) : (
            <div className={styles.saveRow}>
              <input
                className={styles.renameInput}
                value={copyName}
                aria-label="Name for new scenario"
                onChange={(e) => setCopyName(e.target.value)}
              />
              <button
                type="button"
                className={styles.btn}
                disabled={copyName.trim().length === 0}
                onClick={() => onSaveDraft(copyName.trim())}
              >
                Save as new
              </button>
              <button type="button" className={styles.btnText} onClick={() => setSaveAsNewOpen(false)}>
                Cancel
              </button>
            </div>
          )}
        </>
      ) : (
        <div className={styles.btnRow}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={draft.name.trim().length === 0}
            onClick={() => onSaveDraft(draft.name.trim())}
          >
            Save scenario
          </button>
        </div>
      )}
    </div>
  )
}
