import { useState } from 'react'
import type { FieldSpec, FieldValue, InputValue } from './recordFields'
import { buildInitial, buildPatch } from './recordFields'
import formStyles from '../components/TransactionForm.module.css'
import styles from './definitions.module.css'

function inputType(kind: FieldSpec['kind']): string {
  return kind === 'text' ? 'text' : 'number'
}
function stepFor(kind: FieldSpec['kind']): string | undefined {
  if (kind === 'money') return '0.01'
  if (kind === 'percent') return '0.1'
  if (kind === 'number') return '1'
  return undefined
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldSpec
  value: InputValue
  onChange: (value: InputValue) => void
}) {
  if (field.kind === 'toggle') {
    return (
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{field.label}</span>
      </label>
    )
  }
  return (
    <label className={formStyles.field}>
      <span className={formStyles.label}>{field.label}</span>
      {field.kind === 'select' ? (
        <select value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={inputType(field.kind)}
          step={stepFor(field.kind)}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  )
}

interface RecordFormProps {
  fields: FieldSpec[]
  initial: object
  submitLabel: string
  onSubmit: (patch: Record<string, FieldValue>) => Promise<void>
  onClose: () => void
}

/** Generic form driven by a field-spec list; converts euros↔cents and %↔fraction. */
export function RecordForm({ fields, initial, submitLabel, onSubmit, onClose }: RecordFormProps) {
  const [vals, setVals] = useState<Record<string, InputValue>>(() => buildInitial(fields, initial))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      await onSubmit(buildPatch(fields, vals))
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
      setBusy(false)
    }
  }

  return (
    <form
      className={formStyles.form}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      {fields.map((f) => (
        <FieldInput
          key={f.key}
          field={f}
          value={vals[f.key] ?? ''}
          onChange={(v) => setVals((s) => ({ ...s, [f.key]: v }))}
        />
      ))}
      {err && <p className={formStyles.error}>{err}</p>}
      <div className={formStyles.actions}>
        <button type="submit" className={`${formStyles.save} tapActive`} disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
