import { useRef, useState } from 'react'
import { shortMonthYearLabel } from '../../engine/dates'
import { useIsNativeDatePicker } from '../hooks/useIsNativeDatePicker'
import { NativeDateOverlay } from './NativeDateOverlay'
import { MonthPickerPopover } from './MonthPickerPopover'
import styles from './DatePicker.module.css'

interface Props {
  value: string
  ariaLabel?: string
  onChange: (yearMonth: string) => void
}

export function MonthInput({ value, ariaLabel = 'Budget month', onChange }: Props) {
  const native = useIsNativeDatePicker()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

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
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {value ? shortMonthYearLabel(value) : 'Select month'}
      </button>
      {open && (
        <MonthPickerPopover
          value={value}
          triggerRef={triggerRef}
          onSelect={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
