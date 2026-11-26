import type { Flag } from '../../types'
import { useQuickCreateFlag } from './useQuickCreateFlag'
import styles from './FlagPicker.module.css'

function ReimbursableTick({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className={styles.createCheck}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>To be reimbursed</span>
    </label>
  )
}

/**
 * Name-only flag creation, inline in the picker.
 *
 * Its own component so the popover keeps its branch count, and so the busy and
 * error states live next to the input they describe rather than in the parent.
 * Everything but the name takes the full editor's defaults — see quickFlag.ts.
 */
export function QuickCreateFlag({
  flags,
  onCreate,
  onCreated,
  onCancel,
}: {
  flags: Flag[]
  onCreate: (
    name: string,
    reimbursable: boolean,
  ) => Promise<number>
  onCreated: (flagId: number) => void
  onCancel: () => void
}) {
  const { name, setName, reimbursable, setReimbursable, busy, err, setErr, submit } = useQuickCreateFlag(
    flags,
    onCreate,
    onCreated,
  )

  return (
    <div className={styles.create}>
      <input
        className={styles.createInput}
        type="text"
        autoFocus
        aria-label="New flag name"
        placeholder="e.g. Madrid trip"
        value={name}
        disabled={busy}
        onChange={(e) => {
          setName(e.target.value)
          setErr(null)
        }}
        onKeyDown={(e) => {
          // Enter submits and Escape backs out to the list — the popover's own
          // Escape handler would otherwise close the whole picker, losing what
          // was typed and the transaction's place in the form.
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
      <ReimbursableTick checked={reimbursable} disabled={busy} onChange={setReimbursable} />
      {err ? (
        <p className={styles.createError} role="alert">
          {err}
        </p>
      ) : null}
    </div>
  )
}
