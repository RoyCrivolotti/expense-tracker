import { useRef, useState } from 'react'
import type { Flag } from '../../types'
import { EXIT_MS } from '../hooks/motion'
import { Field } from './TransactionFields'
import { FlagPickerPopover } from './FlagPickerPopover'
import { Presence } from './Presence'
import { selectableFlags } from './flagPickerOptions'
import { FlagIcon } from '../icons'
import styles from './FlagField.module.css'

interface Props {
  flags: Flag[]
  value: number | null
  onChange: (flagId: number | null) => void
  /** Caption above the trigger. The batch form says what the flag applies to. */
  label?: string
  /** Render as a compact chip instead of a full-width field. */
  compact?: boolean
  /**
   * The popover portals out of the Modal and runs its own focus trap, so the
   * Modal's trap has to stand down while it is open — otherwise Escape closes
   * the whole editor and focus is yanked back out of the popover.
   */
  onTrapPausedChange?: ((paused: boolean) => void) | undefined
  /** Passed straight through; see FlagPickerPopover. */
  onCreate?: ((name: string, reimbursable: boolean) => Promise<number>) | undefined
}

/**
 * Always rendered, including before any flag exists. Hiding it until the owner
 * had a flag meant the only trace of the feature in the Transactions tab was a
 * card that also hides itself when empty — so nothing pointed at it, and the
 * picker's own "add one under Settings → Flags" copy was unreachable.
 */
export function FlagField({
  flags,
  value,
  onChange,
  label = 'Flag',
  compact = false,
  onTrapPausedChange,
  onCreate,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const selected = selectableFlags(flags, value).find((f) => f.id === value)

  // Reported synchronously; the owner (usePopoverTrapPause) defers the un-pause past
  // the popover's exit, and holds it back entirely when another popover has opened.
  const setOpenState = (next: boolean) => {
    setOpen(next)
    onTrapPausedChange?.(next)
  }

  const trigger = (
    <button
      type="button"
      ref={triggerRef}
      className={compact ? styles.triggerCompact : styles.trigger}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpenState(!open)}
    >
      {selected ? (
        <>
          <span className={styles.swatch} style={{ color: selected.color }} aria-hidden>
            <FlagIcon fill="currentColor" strokeWidth={1.5} />
          </span>
          <span className={styles.name}>{selected.name}</span>
        </>
      ) : (
        <>
          <span className={styles.swatch} aria-hidden>
            <FlagIcon />
          </span>
          <span className={compact ? styles.name : styles.placeholder}>No flag</span>
        </>
      )}
    </button>
  )

  const popover = (
    <Presence show={open} exitMs={EXIT_MS.popover}>
      <FlagPickerPopover
        value={value}
        flags={flags}
        triggerRef={triggerRef}
        onSelect={onChange}
        onClose={() => setOpenState(false)}
        {...(onCreate ? { onCreate } : {})}
      />
    </Presence>
  )

  if (compact) {
    return (
      <>
        {trigger}
        {popover}
      </>
    )
  }

  return (
    <Field label={label} as="div">
      {trigger}
      {popover}
    </Field>
  )
}
