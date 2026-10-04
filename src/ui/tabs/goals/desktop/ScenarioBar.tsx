import { useCallback, useRef, useState } from 'react'
import type { GoalScenario } from '../../../../types'
import type { ExpenseActions } from '../../../actions'
import { ConfirmSheet } from '../../../components/ConfirmSheet'
import { Presence } from '../../../components/Presence'
import { EXIT_MS } from '../../../hooks/motion'
import { deleteMessage } from '../deleteMessage'
import { DiscardSheet } from '../DiscardSheet'
import { readOnlyScenarioNote } from '../readOnlyCopy'
import { SaveButton } from '../SaveButton'
import { UnsavedGroup } from '../UnsavedGroup'
import type { ScenarioEditor } from '../useScenarioEditor'
import goalStyles from '../goals.module.css'
import { ScenarioMenu } from './ScenarioMenu'
import { ScenarioTabs } from './ScenarioTabs'
import styles from './planDesktop.module.css'

interface ScenarioBarProps {
  scenarios: GoalScenario[]
  editor: ScenarioEditor
  /** Absent in a read-only session, which can look at scenarios but not change one. */
  actions: ExpenseActions | undefined
}

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

/** What the edits are worth in a session that cannot save: warm when there are some to lose. */
function ReadOnlyNote({ unsaved }: { unsaved: boolean }) {
  return (
    <p role="status" className={unsaved ? `${styles.readOnly} ${styles.readOnlyEdited}` : styles.readOnly}>
      {readOnlyScenarioNote(unsaved)}
    </p>
  )
}

/**
 * The row above the chart: one tab per scenario, what can be done with the open one, and, while
 * it has edits that are not saved, the way to keep or drop them. The editor underneath is the
 * phone's own, so a scenario behaves the same wherever it is opened.
 */
export function ScenarioBar({ scenarios, editor, actions }: ScenarioBarProps) {
  const activeTab = useRef<HTMLButtonElement>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { activeId, activeScenario, draft, dirty, unsaved, saving, creating } = editor
  // A button that goes (Save when the write lands, Discard) hands focus to the page; this puts
  // it back on the tab of the scenario being edited.
  const focusTab = useCallback(() => activeTab.current?.focus(), [])

  return (
    <div className={styles.scenarioBar}>
      <div className={styles.scenarioRow}>
        <ScenarioTabs
          ref={activeTab}
          scenarios={scenarios}
          activeId={activeId}
          // "Edited" is the word that goes with a Save button, and a read-only session has none; the
          // note under the row says what the edits are worth there.
          dirty={dirty && actions != null}
          draftName={draft.name}
          showDraft={activeId === null || scenarios.length === 0}
          onSelect={editor.onSelectScenario}
          onSelectDraft={editor.onSelectEditing}
        />
        {actions ? (
          <button
            type="button"
            className={styles.newTab}
            aria-label={`Duplicate ${draft.name || 'this scenario'} as a new scenario`}
            disabled={creating}
            onClick={editor.onDuplicate}
          >
            + Duplicate
          </button>
        ) : null}
        <span className={styles.rowSpacer} />
        {actions ? (
          <>
            {activeScenario && dirty ? (
              <>
                <span className={`${goalStyles.dirtyPill} ${styles.rowPill}`}>Unsaved changes</span>
                <UnsavedGroup
                  className={styles.unsavedActions}
                  saveLabel="Save changes"
                  onGone={focusTab}
                  unsaved={{ name: draft.name, saving, onSave: editor.onSaveChanges, onDiscard: editor.onDiscard }}
                />
              </>
            ) : null}
            {activeScenario ? null : <SaveDraft name={draft.name} creating={creating} onSave={editor.onSaveDraft} />}
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
          </>
        ) : null}
      </div>
      {actions ? null : <ReadOnlyNote unsaved={unsaved} />}
      <DiscardSheet {...editor.discardPrompt} />
    </div>
  )
}
