import { useState } from 'react'
import type { Label } from '../../types'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { labelDeleteMessage } from '../components/labelPickerOptions'
import { Presence } from '../components/Presence'
import { EXIT_MS, afterExit } from '../hooks/motion'
import styles from './FlagForm.module.css'

interface Props {
  label: Label | null
  usageCount: number
  busy: boolean
  confirming: boolean
  onSave: () => void
  onCancel: () => void
  onConfirmingChange: (confirming: boolean) => void
  onDelete: () => void
}

function saveButtonText(busy: boolean, label: Label | null): string {
  if (busy) return 'Saving…'
  return label ? 'Save label' : 'Add label'
}

/** Mirrors FlagFormActions exactly — see its comments for the awaitingDelete dance. */
export function LabelFormActions({
  label,
  usageCount,
  busy,
  confirming,
  onSave,
  onCancel,
  onConfirmingChange,
  onDelete,
}: Props) {
  const [awaitingDelete, setAwaitingDelete] = useState(false)
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
        <button type="button" className={styles.saveBtn} disabled={busy || awaitingDelete} onClick={onSave}>
          {saveButtonText(busy, label)}
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

      {label ? (
        <button
          type="button"
          className={styles.deleteBtn}
          disabled={busy || awaitingDelete}
          onClick={() => onConfirmingChange(true)}
        >
          Delete label
        </button>
      ) : null}

      {label ? (
        <Presence show={confirming} exitMs={EXIT_MS.sheet}>
          <ConfirmSheet
            title={`Delete ${label.name}?`}
            message={labelDeleteMessage(usageCount)}
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
