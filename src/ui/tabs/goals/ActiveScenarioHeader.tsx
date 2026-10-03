import { useId, useState } from 'react'
import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import type { ExpenseActions } from '../../actions'
import { ColorSwatchPicker } from '../../components/ColorSwatchPicker'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { Presence } from '../../components/Presence'
import { EXIT_MS } from '../../hooks/motion'
import { deleteMessage } from './deleteMessage'
import { readOnlyScenarioNote } from './readOnlyCopy'
import { NameHintLine } from './UnsavedGroup'
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

/** Save for a draft with no scenario behind it, with the reason it is off written under it when it has no name. */
function DraftSave({ name, hintId, onSave }: { name: string; hintId: string; onSave: (name: string) => void }) {
  const unnamed = name.trim().length === 0
  return (
    <>
      <div className={styles.btnRow}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={unnamed}
          {...(unnamed ? { 'aria-describedby': hintId } : {})}
          onClick={() => onSave(name.trim())}
        >
          Save scenario
        </button>
      </div>
      {unnamed ? <NameHintLine id={hintId} /> : null}
    </>
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
  // A scenario with no name cannot be saved, and the reason is written under the buttons: a tooltip
  // is never shown to a finger.
  const hintId = useId()
  const unnamed = draft.name.trim().length === 0
  const nameReason = unnamed ? { 'aria-describedby': hintId } : {}

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
              disabled={!dirty || saving || unnamed}
              {...nameReason}
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
          {unnamed ? <NameHintLine id={hintId} /> : null}
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
        <DraftSave name={draft.name} hintId={hintId} onSave={onSaveDraft} />
      )}
    </div>
  )
}
