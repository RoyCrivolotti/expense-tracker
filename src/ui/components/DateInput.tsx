import { useRef, useState } from 'react'
import { shortDateLabel } from '../../engine/dates'
import { useIsNativeDatePicker } from '../hooks/useIsNativeDatePicker'
import { NativeDateOverlay } from './NativeDateOverlay'
import { DatePickerPopover } from './DatePickerPopover'
import styles from './DatePicker.module.css'

interface Props {
  value: string
  ariaLabel?: string
  disabled?: boolean
  onChange: (iso: string) => void
}

export function DateInput({ value, ariaLabel = 'Date', disabled, onChange }: Props) {
  const native = useIsNativeDatePicker()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  if (native) {
    return (
      <NativeDateOverlay
        type="date"
        value={value}
        label={shortDateLabel(value)}
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
        onClick={() => { if (!disabled) setOpen((o) => !o) }}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {value ? shortDateLabel(value) : 'Select date'}
      </button>
      {open && (
        <DatePickerPopover
          value={value}
          triggerRef={triggerRef}
          onSelect={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
