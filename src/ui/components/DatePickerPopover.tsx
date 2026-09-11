import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useDismissOnOutsidePointer } from '../charts/useDismissOnOutsidePointer'
import { usePopoverPosition } from '../hooks/usePopoverPosition'
import { buildCalendarGrid, dayCellToIso, type DayCell } from './datePickerGrid'
import styles from './DatePicker.module.css'

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Props {
  value: string
  triggerRef: React.RefObject<HTMLElement | null>
  onSelect: (iso: string) => void
  onClose: () => void
}

export function DatePickerPopover({ value, triggerRef, onSelect, onClose }: Props) {
  const [y, m] = value ? value.split('-').map(Number) as [number, number] : [new Date().getFullYear(), new Date().getMonth() + 1]
  const [viewYear, setViewYear] = useState(y)
  const [viewMonth, setViewMonth] = useState(m)
  const [selected, setSelected] = useState(value)

  const popoverRef = useRef<HTMLDivElement>(null)
  const pos = usePopoverPosition(triggerRef, popoverRef)
  const today = todayIso()

  const grid = buildCalendarGrid(viewYear, viewMonth)

  const prevMonth = useCallback(() => {
    setViewMonth((prev) => {
      if (prev === 1) { setViewYear((y) => y - 1); return 12 }
      return prev - 1
    })
  }, [])

  const nextMonth = useCallback(() => {
    setViewMonth((prev) => {
      if (prev === 12) { setViewYear((y) => y + 1); return 1 }
      return prev + 1
    })
  }, [])

  const selectDay = (cell: DayCell) => {
    const iso = dayCellToIso(cell)
    setSelected(iso)
    if (cell.outside) {
      setViewYear(cell.year)
      setViewMonth(cell.month)
    }
  }

  const confirm = useCallback(() => {
    if (selected) onSelect(selected)
    onClose()
  }, [selected, onSelect, onClose])

  const reset = () => {
    const t = todayIso()
    setSelected(t)
    const [ry, rm] = t.split('-').map(Number) as [number, number]
    setViewYear(ry)
    setViewMonth(rm)
  }

  useFocusTrap(popoverRef, onClose)
  useDismissOnOutsidePointer(popoverRef, true, onClose, triggerRef)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); confirm(); return }

      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
      const container = popoverRef.current
      if (!container) return
      const buttons = Array.from(container.querySelectorAll<HTMLElement>('[role="grid"] button'))
      const idx = buttons.indexOf(document.activeElement as HTMLElement)
      if (idx === -1) return

      let next = idx
      if (e.key === 'ArrowRight') next = idx + 1
      else if (e.key === 'ArrowLeft') next = idx - 1
      else if (e.key === 'ArrowDown') next = idx + 7
      else if (e.key === 'ArrowUp') next = idx - 7

      if (next >= 0 && next < buttons.length) {
        e.preventDefault()
        buttons[next]!.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [confirm])

  return createPortal(
    <div
      ref={popoverRef}
      className={styles.popover}
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
      }}
      role="dialog"
      aria-label="Choose a date"
    >
      <div className={styles.header}>
        <span className={styles.headerTitle}>
          {MONTH_NAMES[viewMonth - 1]} {viewYear}
        </span>
        <div className={styles.headerNav}>
          <button type="button" className={styles.navBtn} onClick={prevMonth} aria-label="Previous month">
            ‹
          </button>
          <button type="button" className={styles.navBtn} onClick={nextMonth} aria-label="Next month">
            ›
          </button>
        </div>
      </div>

      <div className={styles.weekRow}>
        {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
      </div>

      <div className={styles.grid} role="grid">
        {grid.map((row, ri) =>
          row.map((cell) => {
            const iso = dayCellToIso(cell)
            const isSelected = iso === selected
            const isToday = iso === today
            const cls = [
              styles.dayBtn,
              cell.outside ? styles.dayOutside : '',
              isToday ? styles.dayToday : '',
              isSelected ? styles.daySelected : '',
            ].filter(Boolean).join(' ')
            return (
              <button
                key={`${ri}-${cell.day}-${cell.month}`}
                type="button"
                className={cls}
                onClick={() => selectDay(cell)}
                aria-label={`${cell.day} ${MONTH_NAMES[cell.month - 1]} ${cell.year}`}
                aria-pressed={isSelected}
              >
                {cell.day}
              </button>
            )
          }),
        )}
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.resetBtn} onClick={reset}>
          Reset
        </button>
        <button type="button" className={styles.confirmBtn} onClick={confirm} aria-label="Confirm date">
          ✓
        </button>
      </div>
    </div>,
    document.body,
  )
}
