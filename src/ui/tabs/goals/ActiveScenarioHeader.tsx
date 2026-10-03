import { useState } from 'react'
import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import type { ExpenseActions } from '../../actions'
import { ColorSwatchPicker } from '../../components/ColorSwatchPicker'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { Presence } from '../../components/Presence'
import { EXIT_MS } from '../../hooks/motion'
import { deleteMessage } from './deleteMessage'
import styles from './goals.module.css'

interface ActiveScenarioHeaderProps {
  draft: NewGoalScenario
  activeScenario: GoalScenario | null
  dirty: boolean
  /** A save is in flight, so neither Save nor Discard can be taken. */
  saving: boolean
  /** A scenario is being created, so a second Duplicate would make the same copy twice. */
  creating: boolean
  canWrite: boolean
  actions?: ExpenseActions | undefined
  onPatch: (patch: Partial<NewGoalScenario>) => void
  onSaveChanges: () => void
  onDiscard: () => void
  onActivate: () => void
  onSaveDraft: (name: string) => void
  onDuplicate: () => void
}

export function ActiveScenarioHeader({
  draft,
  activeScenario,
  dirty,
  saving,
  creating,
  canWrite,
  actions,
  onPatch,
  onSaveChanges,
  onDiscard,
  onActivate,
  onSaveDraft,
  onDuplicate,
}: ActiveScenarioHeaderProps) {
  const [saveAsNewOpen, setSaveAsNewOpen] = useState(false)
  const [copyName, setCopyName] = useState(`${draft.name} copy`)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (!canWrite) {
    return <p className={styles.chartHint}>Read-only session — scenarios cannot be saved.</p>
  }

  const openSaveAsNew = () => {
    setCopyName(`${draft.name} copy`)
    setSaveAsNewOpen(true)
  }

  return (
    <div className={styles.activeHeader}>
      <div className={styles.activeHeaderTop}>
        <ColorSwatchPicker
          color={draft.color}
          onChange={(color) => onPatch({ color })}
          label="Scenario color"
        />
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
          <div className={styles.pillRow}>
            {activeScenario.isActive ? (
              <span className={styles.planPill}>Current plan</span>
            ) : (
              <button type="button" className={styles.btnText} onClick={onActivate}>
                Use as my plan
              </button>
            )}
            {dirty ? <span className={styles.dirtyPill}>Unsaved changes</span> : null}
          </div>
          <div className={styles.btnRow}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={!dirty || saving}
              onClick={onSaveChanges}
            >
              Save changes
            </button>
            <button type="button" className={styles.btn} disabled={!dirty || saving} onClick={onDiscard}>
              Discard
            </button>
            {actions ? (
              <>
                <button
                  type="button"
                  className={styles.btn}
                  disabled={creating}
                  onClick={onDuplicate}
                >
                  Duplicate
                </button>
                <button type="button" className={styles.btn} onClick={() => setDeleteOpen(true)}>
                  Delete
                </button>
                <Presence show={deleteOpen} exitMs={EXIT_MS.sheet}>
                  <ConfirmSheet
                    title={`Delete ${activeScenario.name}?`}
                    message={deleteMessage(activeScenario)}
                    confirmLabel="Delete"
                    destructive
                    onConfirm={() => {
                      setDeleteOpen(false)
                      void actions.deleteScenario(activeScenario.id)
                    }}
                    onCancel={() => setDeleteOpen(false)}
                  />
                </Presence>
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
