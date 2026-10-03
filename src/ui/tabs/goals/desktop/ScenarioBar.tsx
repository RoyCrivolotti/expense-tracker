import { useCallback, useId, useRef, useState } from 'react'
import type { GoalScenario } from '../../../../types'
import type { ExpenseActions } from '../../../actions'
import { ConfirmSheet } from '../../../components/ConfirmSheet'
import { Presence } from '../../../components/Presence'
import { EXIT_MS } from '../../../hooks/motion'
import { deleteMessage } from '../deleteMessage'
import { DiscardSheet } from '../DiscardSheet'
import { NAME_HINT, UnsavedGroup } from '../UnsavedGroup'
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

/**
 * The row above the chart: one tab per scenario, what can be done with the open one, and, while
 * it has edits that are not saved, the way to keep or drop them. The editor underneath is the
 * phone's own, so a scenario behaves the same wherever it is opened.
 */
export function ScenarioBar({ scenarios, editor, actions }: ScenarioBarProps) {
  const activeTab = useRef<HTMLButtonElement>(null)
  const hintId = useId()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { activeId, activeScenario, draft, dirty, saving, creating } = editor
  const unnamed = draft.name.trim().length === 0
  // A button that goes (Save when the write lands, Discard) hands focus to the page; this puts
  // it back on the tab of the scenario being edited.
  const focusTab = useCallback(() => activeTab.current?.focus(), [])

  return (
    <div className={styles.scenarioRow}>
      <ScenarioTabs
        ref={activeTab}
        scenarios={scenarios}
        activeId={activeId}
        dirty={dirty}
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
                nameHint
                onGone={focusTab}
                unsaved={{ name: draft.name, saving, onSave: editor.onSaveChanges, onDiscard: editor.onDiscard }}
              />
            </>
          ) : null}
          {activeScenario ? null : (
            <>
              {unnamed ? (
                <span id={hintId} className={goalStyles.nameHint}>
                  {NAME_HINT}
                </span>
              ) : null}
              <button
                type="button"
                className={`${goalStyles.btn} ${goalStyles.btnPrimary}`}
                {...(unnamed ? { 'aria-describedby': hintId } : {})}
                disabled={unnamed || creating}
                onClick={() => editor.onSaveDraft(draft.name.trim())}
              >
                Save scenario
              </button>
            </>
          )}
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
      ) : (
        <p className={styles.readOnly}>Read-only session — scenarios cannot be saved.</p>
      )}
      <DiscardSheet {...editor.discardPrompt} />
    </div>
  )
}
