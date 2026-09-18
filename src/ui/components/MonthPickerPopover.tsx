import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useDismissOnOutsidePointer } from '../charts/useDismissOnOutsidePointer'
import { usePopoverPosition } from '../hooks/usePopoverPosition'
import styles from './DatePicker.module.css'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

function currentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface Props {
  value: string
  triggerRef: React.RefObject<HTMLElement | null>
  onSelect: (yearMonth: string) => void
  onClose: () => void
}

export function MonthPickerPopover({ value, triggerRef, onSelect, onClose }: Props) {
  const [valYear, valMonth] = value
    ? (value.split('-').map(Number) as [number, number])
    : [new Date().getFullYear(), new Date().getMonth() + 1]

  const [viewYear, setViewYear] = useState(valYear)

  const popoverRef = useRef<HTMLDivElement>(null)
  const pos = usePopoverPosition(triggerRef, popoverRef)
  const thisMonth = currentYearMonth()
  const [thisY, thisM] = thisMonth.split('-').map(Number) as [number, number]

  const prevYear = useCallback(() => setViewYear((y) => y - 1), [])
  const nextYear = useCallback(() => setViewYear((y) => y + 1), [])

  const selectMonth = (m: number) => {
    onSelect(`${viewYear}-${String(m).padStart(2, '0')}`)
    onClose()
  }

  const reset = () => {
    onSelect(`${thisY}-${String(thisM).padStart(2, '0')}`)
    onClose()
  }

  useFocusTrap(popoverRef, onClose)
  useDismissOnOutsidePointer(popoverRef, true, onClose, triggerRef)

  return createPortal(
    <div
      ref={popoverRef}
      className={styles.popover}
      style={{
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
      aria-label="Choose a month"
    >
      <div className={styles.header}>
        <span className={styles.headerTitle}>{viewYear}</span>
        <div className={styles.headerNav}>
          <button type="button" className={styles.navBtn} onClick={prevYear} aria-label="Previous year">
            ‹
          </button>
          <button type="button" className={styles.navBtn} onClick={nextYear} aria-label="Next year">
            ›
          </button>
        </div>
      </div>

      <div className={styles.monthGrid}>
        {MONTHS.map((label, i) => {
          const m = i + 1
          const isSelected = viewYear === valYear && m === valMonth
          const isCurrent = viewYear === thisY && m === thisM
          const cls = [
            styles.monthBtn,
            isCurrent ? styles.monthCurrent : '',
            isSelected ? styles.monthSelected : '',
          ].filter(Boolean).join(' ')
          return (
            <button
              key={label}
              type="button"
              className={cls}
              onClick={() => selectMonth(m)}
              aria-label={`${MONTHS[i]} ${viewYear}`}
              aria-pressed={isSelected}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.resetBtn} onClick={reset}>
          Reset
        </button>
      </div>
    </div>,
    document.body,
  )
}
