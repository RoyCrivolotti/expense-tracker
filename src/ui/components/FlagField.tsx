import { useRef, useState } from 'react'
import type { Flag } from '../../types'
import { Field } from './TransactionFields'
import { FlagPickerPopover } from './FlagPickerPopover'
import { selectableFlags } from './flagPickerOptions'
import { FlagIcon } from '../icons'
import styles from './FlagField.module.css'

interface Props {
  flags: Flag[]
  value: number | null
  onChange: (flagId: number | null) => void
  /**
   * The popover portals out of the Modal and runs its own focus trap, so the
   * Modal's trap has to stand down while it is open — otherwise Escape closes
   * the whole editor and focus is yanked back out of the popover.
   */
  onTrapPausedChange?: ((paused: boolean) => void) | undefined
}

export function FlagField({ flags, value, onChange, onTrapPausedChange }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  // Nothing to pick and nothing picked: don't spend a row on it.
  if (flags.length === 0 && value == null) return null

  const selected = selectableFlags(flags, value).find((f) => f.id === value)

  const setOpenState = (next: boolean) => {
    setOpen(next)
    onTrapPausedChange?.(next)
  }

  return (
    <Field label="Flag" as="div">
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpenState(!open)}
      >
        {selected ? (
          <>
            <span className={styles.swatch} style={{ color: selected.color }} aria-hidden>
              <FlagIcon fill="currentColor" strokeWidth={1.5} />
            </span>
            {selected.name}
          </>
        ) : (
          <span className={styles.placeholder}>No flag</span>
        )}
      </button>
      {open ? (
        <FlagPickerPopover
          value={value}
          flags={flags}
          triggerRef={triggerRef}
          onSelect={onChange}
          onClose={() => setOpenState(false)}
        />
      ) : null}
    </Field>
  )
}
