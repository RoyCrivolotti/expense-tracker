import { useMemo } from 'react'
import { useUnsavedWork } from '../../nav/leaveGuardContext'
import type { ScenarioEditor } from './useScenarioEditor'

/**
 * Tells the shell when leaving Goals would drop edits, so it asks first. The editor's state lives
 * in the tab, which unmounts on the way out; nothing keeps the draft. `canSave` is false in a
 * read-only session, where the question says so rather than offering a Save that is not there.
 */
export function useGoalsUnsavedWork(editor: ScenarioEditor, canSave: boolean): void {
  const { unsaved, saving, creating } = editor
  const { name, detached } = editor.discardPrompt
  // A copy being made is a save too: the new scenario is written whether or not the tab is still up.
  const busy = saving || creating
  const work = useMemo(
    () => (unsaved ? { name, detached, canSave, saving: busy } : null),
    [unsaved, name, detached, canSave, busy],
  )
  useUnsavedWork(work)
}
