import { useRef, useState } from 'react'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useFocusTrap } from '../hooks/useFocusTrap'
import formStyles from './TransactionForm.module.css'
import styles from './ConfirmSheet.module.css'

export interface ReassignOption {
  id: number
  name: string
}

export type ReassignTarget = { reassignToId: number } | { createName: string }

const CREATE_NEW = '__create__'

interface ReassignDeleteSheetProps {
  title: string
  message: string
  /** Other existing records the deleted one's data can move to. */
  options: ReassignOption[]
  /** Noun used in the "+ Create new <label>" option and the name field's placeholder. */
  createLabel: string
  onCancel: () => void
  onConfirm: (target: ReassignTarget) => Promise<void>
}

/** Destructive delete flow for a record in use: reassign to an existing one, or create a new one in place. */
export function ReassignDeleteSheet({
  title,
  message,
  options,
  createLabel,
  onCancel,
  onConfirm,
}: ReassignDeleteSheetProps) {
  useBodyScrollLock(true)
  const sheetRef = useRef<HTMLDivElement>(null)
  useFocusTrap(sheetRef, onCancel)

  const [selection, setSelection] = useState<string>(
    options[0] ? String(options[0].id) : CREATE_NEW,
  )
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const creatingNew = selection === CREATE_NEW
  const canConfirm = creatingNew ? newName.trim().length > 0 : true

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      await onConfirm(
        creatingNew ? { createName: newName.trim() } : { reassignToId: Number(selection) },
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not delete')
      setBusy(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onCancel} role="presentation">
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reassign-title"
        aria-describedby="reassign-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="reassign-title" className={styles.title}>
          {title}
        </h2>
        <p id="reassign-message" className={styles.message}>
          {message}
        </p>
        <label className={formStyles.field}>
          <span className={formStyles.label}>Move to</span>
          <select value={selection} onChange={(e) => setSelection(e.target.value)}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            <option value={CREATE_NEW}>+ Create new {createLabel}</option>
          </select>
        </label>
        {creatingNew ? (
          <label className={formStyles.field}>
            <span className={formStyles.label}>New {createLabel} name</span>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`e.g. Corrected ${createLabel} name`}
              autoComplete="off"
              autoFocus
            />
          </label>
        ) : null}
        {err && <p className={formStyles.error}>{err}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.confirm} ${styles.confirmDestructive}`}
            onClick={() => void submit()}
            disabled={busy || !canConfirm}
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
