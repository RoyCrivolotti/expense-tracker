import { useState } from 'react'
import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import type { ExpenseActions } from '../../actions'
import { SCENARIO_NAME_MAX_LENGTH } from '../../../engine'
import { ColorSwatchPicker } from '../../components/ColorSwatchPicker'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { Presence } from '../../components/Presence'
import { EXIT_MS } from '../../hooks/motion'
import { deleteMessage } from './deleteMessage'
import { readOnlyScenarioNote } from './readOnlyCopy'
import { SaveButton } from './SaveButton'
import styles from './goals.module.css'

interface ActiveScenarioHeaderProps {
  draft: NewGoalScenario
  activeScenario: GoalScenario | null
  dirty: boolean
  /** There are edits that would be lost on leaving, saved scenario or not: all a read-only session has to say. */
  hasEdits: boolean
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

/** Save for a draft with no scenario behind it, which says why it is off when it has no name. */
function DraftSave({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  return (
    <div className={styles.btnRow}>
      <SaveButton
        className={`${styles.btn} ${styles.btnPrimary}`}
        unnamed={name.trim().length === 0}
        onSave={() => onSave(name.trim())}
      >
        Save scenario
      </SaveButton>
    </div>
  )
}

export function ActiveScenarioHeader({
  draft,
  activeScenario,
  dirty,
  hasEdits,
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
  const unnamed = draft.name.trim().length === 0

  if (!canWrite) {
    return (
      <p role="status" className={styles.chartHint}>
        {readOnlyScenarioNote(hasEdits)}
      </p>
    )
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
        maxLength={SCENARIO_NAME_MAX_LENGTH}
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
            <SaveButton
              className={`${styles.btn} ${styles.btnPrimary}`}
              unnamed={unnamed}
              disabled={!dirty || saving}
              onSave={onSaveChanges}
            >
              Save changes
            </SaveButton>
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
              <SaveButton
                className={styles.btn}
                unnamed={copyName.trim().length === 0}
                onSave={() => onSaveDraft(copyName.trim())}
              >
                Save as new
              </SaveButton>
              <button type="button" className={styles.btnText} onClick={() => setSaveAsNewOpen(false)}>
                Cancel
              </button>
            </div>
          )}
        </>
      ) : (
        <DraftSave name={draft.name} onSave={onSaveDraft} />
      )}
    </div>
  )
}
