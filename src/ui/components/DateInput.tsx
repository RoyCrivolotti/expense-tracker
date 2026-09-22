import { useRef, useState } from 'react'
import { shortDateLabel } from '../../engine/dates'
import { isNativeDatePicker } from '../hooks/isNativeDatePicker'
import { EXIT_MS } from '../hooks/motion'
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
  // Reported synchronously; the owner (usePopoverTrapPause) defers the un-pause past
  // the popover's exit, and holds it back entirely when another popover has opened.
  const setOpenState = (next: boolean) => {
    setOpen(next)
    onTrapPausedChange?.(next)
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
