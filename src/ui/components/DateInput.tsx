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
}

export function DateInput({ value, ariaLabel = 'Date', disabled, min, max, onChange }: Props) {
  const native = isNativeDatePicker()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

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
        onClick={() => { if (!disabled) setOpen((o) => !o) }}
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
          onClose={() => setOpen(false)}
        />
      </Presence>
    </>
  )
}
