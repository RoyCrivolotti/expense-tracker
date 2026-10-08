import { useCallback, useState } from 'react'
import type { ExpenseActions } from '../../../actions'
import { ConfirmSheet } from '../../../components/ConfirmSheet'
import { Presence } from '../../../components/Presence'
import { EXIT_MS } from '../../../hooks/motion'
import { deleteMessage } from '../deleteMessage'
import { SaveButton } from '../SaveButton'
import { UnsavedGroup } from '../UnsavedGroup'
import type { ScenarioEditor } from '../useScenarioEditor'
import goalStyles from '../goals.module.css'
import { OPEN_CHIP_SELECTOR } from './chipFocus'
import { ScenarioMenu } from './ScenarioMenu'
import styles from './planDesktop.module.css'

/** The draft's Save scenario button, which says why it is off when it has no name. */
function SaveDraft({ name, creating, onSave }: { name: string; creating: boolean; onSave: (name: string) => void }) {
  return (
    <SaveButton
      className={`${goalStyles.btn} ${goalStyles.btnPrimary}`}
      unnamed={name.trim().length === 0}
      disabled={creating}
      onSave={() => onSave(name.trim())}
    >
      Save scenario
    </SaveButton>
  )
}

interface ScenarioActionsProps {
  editor: ScenarioEditor
  actions: ExpenseActions
}

/**
 * What can be done with the open scenario: duplicate it, the menu, and while it has edits that
 * are not saved, the way to keep or drop them. It sits in the title row, beside the view switch,
 * so none of it takes height from the page and nothing moves when the scenario is edited.
 */
export function ScenarioActions({ editor, actions }: ScenarioActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { activeScenario, draft, dirty, saving, creating } = editor
  // A button that goes (Save when the write lands, Discard) hands focus to the page; this puts
  // it back on the chip of the scenario being edited. The chips are elsewhere on the page, so
  // it is found by what it is rather than held by a ref.
  const focusChip = useCallback(() => document.querySelector<HTMLElement>(OPEN_CHIP_SELECTOR)?.focus(), [])

  return (
    <div className={styles.actions}>
      {activeScenario && dirty ? (
        <>
          <span className={`${goalStyles.dirtyPill} ${styles.rowPill}`}>Unsaved changes</span>
          <UnsavedGroup
            className={styles.unsavedActions}
            saveLabel="Save changes"
            onGone={focusChip}
            unsaved={{ name: draft.name, saving, onSave: editor.onSaveChanges, onDiscard: editor.onDiscard }}
          />
        </>
      ) : null}
      {activeScenario ? null : <SaveDraft name={draft.name} creating={creating} onSave={editor.onSaveDraft} />}
      <button
        type="button"
        className={styles.duplicate}
        aria-label={`Duplicate ${draft.name || 'this scenario'} as a new scenario`}
        disabled={creating}
        onClick={editor.onDuplicate}
      >
        Duplicate
      </button>
      <ScenarioMenu
        draft={draft}
        activeScenario={activeScenario}
        dirty={dirty}
        onPatch={editor.patchDraft}
        onActivate={editor.onActivate}
        onDuplicate={editor.onDuplicate}
        onDelete={() => setDeleteOpen(true)}
        onSaveAsNew={editor.onSaveDraft}
        onKeepAsDraft={editor.onSelectEditing}
      />
      <Presence show={deleteOpen} exitMs={EXIT_MS.sheet}>
        {activeScenario ? (
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
        ) : null}
      </Presence>
    </div>
  )
}
