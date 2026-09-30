import { useState } from 'react'
import type { Label } from '../../types'
import type { ExpenseActions } from '../actions'
import { SCENARIO_COLORS } from '../../engine'
import { ColorSwatchPicker } from '../components/ColorSwatchPicker'
import { transactionCountLabel } from '../components/flagPickerOptions'
import { LabelFormActions } from './LabelFormActions'
import { initialLabelDraft, useLabelFormSave } from './useLabelFormSave'
import styles from './FlagForm.module.css'

const DEFAULT_COLOR = SCENARIO_COLORS[0]

interface Props {
  label: Label | null
  /** Used to place a new label at the end of the user's ordering. */
  existing: Label[]
  usageCount: number
  actions: ExpenseActions
  onDone: () => void
  /** Lets the enclosing Modal pause its focus trap while the sheet is open. */
  onConfirmingChange?: ((confirming: boolean) => void) | undefined
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input
        className={styles.input}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

function ActiveToggle({
  active,
  usageCount,
  onChange,
}: {
  active: boolean
  usageCount: number
  onChange: (active: boolean) => void
}) {
  return (
    <label className={styles.toggleField}>
      <input type="checkbox" checked={active} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className={styles.label}>Active</span>
        <span className={styles.hint}>
          Archiving hides it from the pickers but keeps the{' '}
          {transactionCountLabel(usageCount)} already labeled with it.
        </span>
      </span>
    </label>
  )
}

/** Mirrors FlagForm exactly, minus the "To be reimbursed" field — labels never offer one. */
export function LabelForm({
  label,
  existing,
  usageCount,
  actions,
  onDone,
  onConfirmingChange,
}: Props) {
  const [draft, setDraft] = useState(() => initialLabelDraft(label, DEFAULT_COLOR))
  const [confirming, setConfirming] = useState(false)
  const patch = (next: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...next }))
  const { busy, err, save, remove } = useLabelFormSave(label, existing, actions, onDone)

  const setConfirmingDelete = (next: boolean) => {
    setConfirming(next)
    onConfirmingChange?.(next)
  }

  return (
    <div className={styles.form}>
      <TextField
        label="Name"
        value={draft.name}
        placeholder="Japan trip"
        onChange={(name) => patch({ name })}
      />
      <TextField
        label="Description (optional)"
        value={draft.description}
        placeholder="Spring 2027"
        onChange={(description) => patch({ description })}
      />

      <div className={styles.field}>
        <span className={styles.label}>Colour</span>
        <ColorSwatchPicker
          color={draft.color}
          onChange={(color) => patch({ color })}
          label="Label colour"
        />
      </div>

      {label ? (
        <ActiveToggle
          active={draft.active}
          usageCount={usageCount}
          onChange={(active) => patch({ active })}
        />
      ) : null}

      {err ? <p className={styles.error}>{err}</p> : null}

      <LabelFormActions
        label={label}
        usageCount={usageCount}
        busy={busy}
        confirming={confirming}
        onSave={() => save(draft)}
        onCancel={onDone}
        onConfirmingChange={setConfirmingDelete}
        onDelete={remove}
      />
    </div>
  )
}
