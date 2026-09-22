import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Flag } from '../../types'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useDismissOnOutsidePointer } from '../charts/useDismissOnOutsidePointer'
import { usePopoverMotion } from '../hooks/usePopoverMotion'
import { usePopoverPosition } from '../hooks/usePopoverPosition'
import { FlagIcon } from '../icons'
import { selectableFlags } from './flagPickerOptions'
import { duplicateFlagName, quickFlagDraft } from './quickFlag'
import styles from './FlagPicker.module.css'

interface Props {
  /** Currently applied flag id, or null when the transaction is unflagged. */
  value: number | null
  flags: Flag[]
  triggerRef: React.RefObject<HTMLElement | null>
  onSelect: (flagId: number | null) => void
  onClose: () => void
  /**
   * Create a flag from here. Optional: the bulk-edit sheet has no `actions` to
   * hand down, and a picker without it simply falls back to pointing at
   * Settings, exactly as before.
   */
  onCreate?: ((name: string, reimbursable: boolean) => Promise<number>) | undefined
}

/**
 * Name-only flag creation, inline in the picker.
 *
 * Its own component so the popover keeps its branch count, and so the busy and
 * error states live next to the input they describe rather than in the parent.
 * Everything but the name takes the full editor's defaults — see quickFlag.ts.
 */
function QuickCreate({
  flags,
  onCreate,
  onCreated,
  onCancel,
}: {
  flags: Flag[]
  onCreate: (name: string, reimbursable: boolean) => Promise<number>
  onCreated: (flagId: number) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  // Ticked by default, matching the full editor. Asked rather than assumed: it
  // decides whether the flag offers an expense report and a Record
  // reimbursement action at all.
  const [reimbursable, setReimbursable] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (busy) return
    if (!quickFlagDraft(name, flags)) {
      setErr('Enter a name')
      return
    }
    if (duplicateFlagName(name, flags)) {
      setErr('There is already a flag with that name')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      onCreated(await onCreate(name, reimbursable))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the flag')
      setBusy(false)
    }
  }

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
      <label className={styles.createCheck}>
        <input
          type="checkbox"
          checked={reimbursable}
          disabled={busy}
          onChange={(e) => setReimbursable(e.target.checked)}
        />
        <span>To be reimbursed</span>
      </label>
      {err ? (
        <p className={styles.createError} role="alert">
          {err}
        </p>
      ) : null}
    </div>
  )
}

export function FlagPickerPopover({
  value,
  flags,
  triggerRef,
  onSelect,
  onClose,
  onCreate,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const pos = usePopoverPosition(triggerRef, popoverRef)
  const motion = usePopoverMotion(pos)
  const options = selectableFlags(flags, value)
  const [creating, setCreating] = useState(false)

  useFocusTrap(popoverRef, onClose, motion.leaving)
  useDismissOnOutsidePointer(popoverRef, !motion.leaving, onClose, triggerRef)

  const choose = (flagId: number | null) => {
    onSelect(flagId)
    onClose()
  }

  return createPortal(
    <div
      ref={popoverRef}
      className={motion.leaving ? `${styles.popover} ${styles.popoverLeaving}` : styles.popover}
      {...motion.attrs}
      style={{
        ...motion.exit,
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        // Capped to the visible band and scrollable, so a popover taller than
        // the space left by an open keyboard stays reachable instead of running
        // off the screen.
        maxHeight: pos?.maxHeight,
        overflowY: 'auto',
        visibility: pos ? 'visible' : 'hidden',
      }}
      role="dialog"
      aria-label="Choose a flag"
    >
      <ul className={styles.list}>
        <li>
          <button
            type="button"
            className={styles.option}
            onClick={() => choose(null)}
            aria-pressed={value === null}
          >
            <span className={`${styles.swatch} ${styles.swatchNone}`} aria-hidden />
            <span className={styles.optionBody}>
              <span className={styles.optionName}>No flag</span>
            </span>
            {value === null ? <span className={styles.tick} aria-hidden>✓</span> : null}
          </button>
        </li>
        {options.map((flag) => (
          <li key={flag.id}>
            <button
              type="button"
              className={styles.option}
              onClick={() => choose(flag.id)}
              aria-pressed={value === flag.id}
            >
              <span className={styles.swatch} style={{ color: flag.color }} aria-hidden>
                <FlagIcon fill="currentColor" strokeWidth={1.5} />
              </span>
              <span className={styles.optionBody}>
                <span className={styles.optionName}>
                  {flag.name}
                  {!flag.active ? <span className={styles.archived}> · archived</span> : null}
                </span>
                {flag.description ? (
                  <span className={styles.optionDesc}>{flag.description}</span>
                ) : null}
              </span>
              {value === flag.id ? <span className={styles.tick} aria-hidden>✓</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {onCreate ? (
        creating ? (
          <QuickCreate
            flags={flags}
            onCreate={onCreate}
            onCreated={choose}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <button type="button" className={styles.newFlag} onClick={() => setCreating(true)}>
            + New flag
          </button>
        )
      ) : options.length === 0 ? (
        <p className={styles.empty}>
          No flags to choose from. Add one under Settings &rarr; Flags.
        </p>
      ) : null}
    </div>,
    document.body,
  )
}
