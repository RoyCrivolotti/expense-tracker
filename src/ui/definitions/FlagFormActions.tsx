import { useState } from 'react'
import type { Flag } from '../../types'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { flagDeleteMessage } from '../components/flagPickerOptions'
import { Presence } from '../components/Presence'
import { EXIT_MS, afterExit } from '../hooks/motion'
import styles from './FlagForm.module.css'

interface Props {
  flag: Flag | null
  usageCount: number
  busy: boolean
  confirming: boolean
  onSave: () => void
  onCancel: () => void
  onConfirmingChange: (confirming: boolean) => void
  onDelete: () => void
}

function saveLabel(busy: boolean, flag: Flag | null): string {
  if (busy) return 'Saving…'
  return flag ? 'Save flag' : 'Add flag'
}

export function FlagFormActions({
  flag,
  usageCount,
  busy,
  confirming,
  onSave,
  onCancel,
  onConfirmingChange,
  onDelete,
}: Props) {
  // Confirming closes this sheet and asks the parent to delete in the same click; the
  // parent's own reaction to a settled delete unmounts the whole form (see FlagsModal),
  // which would otherwise cut this sheet's exit short whenever the request beats it.
  // `busy` doesn't flip true until `onDelete` actually fires below, so this stands in
  // for it during the wait and hands off to `busy` the moment the real request starts.
  const [awaitingDelete, setAwaitingDelete] = useState(false)
  // Adjusted during render rather than an effect, the same way Presence follows a prop
  // without an extra commit: one-directional and guarded, so it cannot loop.
  if (busy && awaitingDelete) setAwaitingDelete(false)

  const confirmDelete = async () => {
    setAwaitingDelete(true)
    onConfirmingChange(false)
    await afterExit(EXIT_MS.sheet)
    onDelete()
  }

  return (
    <>
      <div className={styles.actions}>
        {/* Also off while a confirmed delete waits out its sheet's exit: a Save landing
            in that window would update the flag and then still have it deleted. */}
        <button type="button" className={styles.saveBtn} disabled={busy || awaitingDelete} onClick={onSave}>
          {saveLabel(busy, flag)}
        </button>
        <button
          type="button"
          className={styles.cancelBtn}
          disabled={busy || awaitingDelete}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>

      {flag ? (
        <button
          type="button"
          className={styles.deleteBtn}
          disabled={busy || awaitingDelete}
          onClick={() => onConfirmingChange(true)}
        >
          Delete flag
        </button>
      ) : null}

      {flag ? (
        <Presence show={confirming} exitMs={EXIT_MS.sheet}>
          <ConfirmSheet
            title={`Delete ${flag.name}?`}
            message={flagDeleteMessage(usageCount)}
            confirmLabel="Delete"
            destructive
            onConfirm={() => void confirmDelete()}
            onCancel={() => onConfirmingChange(false)}
          />
        </Presence>
      ) : null}
    </>
  )
}
