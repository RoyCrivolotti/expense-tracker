import { useRef, useState } from 'react'
import { EXIT_MS } from '../hooks/motion'
import { DayOfMonthPopover } from './DayOfMonthPopover'
import { ordinalDay } from './dayOfMonth'
import { Presence } from './Presence'
import styles from './DatePicker.module.css'

interface Props {
  value: number
  ariaLabel: string
  onChange: (day: number) => void
}

/**
 * Picks a day of the month, 1 to 28. A button that opens a grid rather than a number field:
 * every choice is one tap, and nothing can be typed that is out of range.
 */
export function DayOfMonthInput({ value, ariaLabel, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(!open)}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {ordinalDay(value)}
      </button>
      <Presence show={open} exitMs={EXIT_MS.popover}>
        <DayOfMonthPopover value={value} triggerRef={triggerRef} onSelect={onChange} onClose={() => setOpen(false)} />
      </Presence>
    </>
  )
}
