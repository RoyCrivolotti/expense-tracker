import { useRef, useState } from 'react'
import { shortMonthYearLabel } from '../../engine/dates'
import { isNativeDatePicker } from '../hooks/isNativeDatePicker'
import { EXIT_MS } from '../hooks/motion'
import { NativeDateOverlay } from './NativeDateOverlay'
import { MonthPickerPopover } from './MonthPickerPopover'
import { Presence } from './Presence'
import styles from './DatePicker.module.css'

interface Props {
  value: string
  ariaLabel?: string
  onChange: (yearMonth: string) => void
  /**
   * The popover portals out of the Modal and runs its own focus trap, so the
   * Modal's trap has to stand down while it is open — otherwise Escape closes
   * the whole editor and focus is yanked back out of the popover.
   */
  onTrapPausedChange?: ((paused: boolean) => void) | undefined
}

export function MonthInput({
  value,
  ariaLabel = 'Budget month',
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
        type="month"
        value={value}
        label={shortMonthYearLabel(value)}
        ariaLabel={ariaLabel}
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
        onClick={() => setOpenState(!open)}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {value ? shortMonthYearLabel(value) : 'Select month'}
      </button>
      <Presence show={open} exitMs={EXIT_MS.popover}>
        <MonthPickerPopover
          value={value}
          triggerRef={triggerRef}
          onSelect={onChange}
          onClose={() => setOpenState(false)}
        />
      </Presence>
    </>
  )
}
