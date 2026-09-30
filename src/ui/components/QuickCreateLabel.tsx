import { useState } from 'react'
import type { Label } from '../../types'
import { duplicateLabelName, quickLabelDraft } from './quickLabel'
import styles from './FlagPicker.module.css'

/**
 * Name-only label creation, inline. Shared by LabelPickerPopover (the edit
 * sheet's multi-select) and FlagAutoLabelEditor (Settings' single-select) —
 * both want the exact same name-input-plus-Add widget, not two copies of it.
 */
export function QuickCreateLabel({
  labels,
  onCreate,
  onCreated,
  onCancel,
}: {
  labels: Label[]
  onCreate: (name: string) => Promise<number>
  onCreated: (labelId: number) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (busy) return
    if (!quickLabelDraft(name, labels)) {
      setErr('Enter a name')
      return
    }
    if (duplicateLabelName(name, labels)) {
      setErr('There is already a label with that name')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      onCreated(await onCreate(name))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the label')
      setBusy(false)
    }
  }

  return (
    <div className={styles.create}>
      <input
        className={styles.createInput}
        type="text"
        autoFocus
        aria-label="New label name"
        placeholder="e.g. Japan trip"
        value={name}
        disabled={busy}
        onChange={(e) => {
          setName(e.target.value)
          setErr(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void submit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onCancel()
          }
        }}
      />
      <button type="button" className={styles.createAdd} disabled={busy} onClick={() => void submit()}>
        {busy ? 'Adding…' : 'Add'}
      </button>
      {err ? (
        <p className={styles.createError} role="alert">
          {err}
        </p>
      ) : null}
    </div>
  )
}
