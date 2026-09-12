import type { Flag } from '../../types'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { flagDeleteMessage } from '../components/flagPickerOptions'
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
  return (
    <>
      <div className={styles.actions}>
        <button type="button" className={styles.saveBtn} disabled={busy} onClick={onSave}>
          {saveLabel(busy, flag)}
        </button>
        <button type="button" className={styles.cancelBtn} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>

      {flag ? (
        <button
          type="button"
          className={styles.deleteBtn}
          disabled={busy}
          onClick={() => onConfirmingChange(true)}
        >
          Delete flag
        </button>
      ) : null}

      {confirming && flag ? (
        <ConfirmSheet
          title={`Delete ${flag.name}?`}
          message={flagDeleteMessage(usageCount)}
          confirmLabel="Delete"
          destructive
          onConfirm={() => {
            onConfirmingChange(false)
            onDelete()
          }}
          onCancel={() => onConfirmingChange(false)}
        />
      ) : null}
    </>
  )
}
