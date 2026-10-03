import { ConfirmSheet } from '../../components/ConfirmSheet'
import { Presence } from '../../components/Presence'
import { EXIT_MS } from '../../hooks/motion'
import { keepEditsHint } from './readOnlyCopy'
import type { DiscardPrompt } from './useScenarioEditor'

/**
 * Asked before loading another scenario over unsaved edits. Held inside Presence so the
 * sheet keeps its text while it animates out. A detached draft has no saved scenario to
 * "save changes" to, so it is told to save the draft as a new one. In a read-only session nothing
 * can be saved, and it says that instead of offering a way out that is not there.
 */
export function DiscardSheet({ pending, open, detached, canSave, name, onConfirm, onCancel }: DiscardPrompt) {
  const keep = keepEditsHint(canSave, detached)
  return (
    <Presence show={open} exitMs={EXIT_MS.sheet}>
      {pending ? (
        <ConfirmSheet
          title={detached ? 'Discard the unsaved draft?' : `Discard unsaved changes to ${name}?`}
          message={`Loading ${pending.name} drops the edits made here. ${keep}`}
          confirmLabel="Discard"
          destructive
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      ) : null}
    </Presence>
  )
}
