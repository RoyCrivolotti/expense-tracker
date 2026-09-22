import { useRef, useState } from 'react'
import { shortDateLabel } from '../../engine/dates'
import { isNativeDatePicker } from '../hooks/isNativeDatePicker'
import { EXIT_MS, afterExit } from '../hooks/motion'
import { NativeDateOverlay } from './NativeDateOverlay'
import { DatePickerPopover } from './DatePickerPopover'
import { Presence } from './Presence'
import styles from './DatePicker.module.css'

interface Props {
  value: string
  ariaLabel?: string
  disabled?: boolean
  /** Inclusive ISO bounds. Both pickers refuse a date outside them. */
  min?: string | undefined
  max?: string | undefined
  onChange: (iso: string) => void
  /**
   * The popover portals out of the Modal and runs its own focus trap, so the
   * Modal's trap has to stand down while it is open — otherwise Escape closes
   * the whole editor and focus is yanked back out of the popover.
   */
  onTrapPausedChange?: ((paused: boolean) => void) | undefined
}

export function DateInput({
  value,
  ariaLabel = 'Date',
  disabled,
  min,
  max,
  onChange,
  onTrapPausedChange,
}: Props) {
  const native = isNativeDatePicker()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  // Bumped on every close, so a stale close's delayed un-pause can tell it is no longer
  // the latest one and skip itself — otherwise a fast reopen would have its own pause
  // clobbered back to unpaused when the earlier close's timer finally runs.
  const closeTokenRef = useRef(0)

  const setOpenState = (next: boolean) => {
    setOpen(next)
    closeTokenRef.current += 1
    if (next) {
      onTrapPausedChange?.(true)
      return
    }
    // The popover stays mounted, portalled outside the Modal, for its own exit — un-pause
    // only once it has actually gone, or the Modal's trap reactivates while something
    // outside its own container can still hold focus.
    const token = closeTokenRef.current
    void afterExit(EXIT_MS.popover).then(() => {
      if (closeTokenRef.current === token) onTrapPausedChange?.(false)
    })
  }

  if (native) {
    return (
      <NativeDateOverlay
        type="date"
        value={value}
        label={shortDateLabel(value)}
        ariaLabel={ariaLabel}
        disabled={disabled}
        min={min}
        max={max}
        onChange={onChange}
      />
    )
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => { if (!disabled) setOpenState(!open) }}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {value ? shortDateLabel(value) : 'Select date'}
      </button>
      <Presence show={open} exitMs={EXIT_MS.popover}>
        <DatePickerPopover
          value={value}
          triggerRef={triggerRef}
          min={min}
          max={max}
          onSelect={onChange}
          onClose={() => setOpenState(false)}
        />
      </Presence>
    </>
  )
}
