import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useDismissOnOutsidePointer } from '../charts/useDismissOnOutsidePointer'
import { usePopoverMotion } from '../hooks/usePopoverMotion'
import { usePopoverPosition } from '../hooks/usePopoverPosition'
import { buildCalendarGrid, dayCellToIso, isDateOutOfRange, type DayCell } from './datePickerGrid'
import { PopoverFrame } from './PopoverFrame'
import { DayGrid, MonthHeader } from './DatePickerParts'
import { moveGridFocus, todayIso } from './datePickerFocus'
import styles from './DatePicker.module.css'

interface Props {
  value: string
  triggerRef: React.RefObject<HTMLElement | null>
  /** Inclusive ISO bounds. Days outside are rendered disabled, not merely dimmed. */
  min?: string | undefined
  max?: string | undefined
  onSelect: (iso: string) => void
  onClose: () => void
}

export function DatePickerPopover({ value, triggerRef, min, max, onSelect, onClose }: Props) {
  const [y, m] = value
    ? (value.split('-').map(Number) as [number, number])
    : [new Date().getFullYear(), new Date().getMonth() + 1]
  // Year and month move together in one state value. Two setters, one called from
  // inside the other's updater, change the year twice under StrictMode, which
  // runs updaters twice.
  const [view, setView] = useState({ year: y, month: m })
  const { year: viewYear, month: viewMonth } = view

  const popoverRef = useRef<HTMLDivElement>(null)
  const pos = usePopoverPosition(triggerRef, popoverRef)
  const motion = usePopoverMotion(pos)
  const today = todayIso()

  const grid = buildCalendarGrid(viewYear, viewMonth)

  const prevMonth = useCallback(() => {
    setView(({ year, month }) => (month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }))
  }, [])

  const nextMonth = useCallback(() => {
    setView(({ year, month }) => (month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }))
  }, [])

  const selectDay = (cell: DayCell) => {
    const iso = dayCellToIso(cell)
    // Guarded here too: the disabled attribute stops a click, not a keyboard path
    // that reaches this directly.
    if (isDateOutOfRange(iso, min, max)) return
    onSelect(iso)
    onClose()
  }

  const reset = () => {
    onSelect(todayIso())
    onClose()
  }

  useFocusTrap(popoverRef, onClose, motion.leaving)
  useDismissOnOutsidePointer(popoverRef, !motion.leaving, onClose, triggerRef)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => moveGridFocus(e, popoverRef.current)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <PopoverFrame popoverRef={popoverRef} pos={pos} motion={motion} classes={styles} label="Choose a date">
      <MonthHeader year={viewYear} month={viewMonth} onPrev={prevMonth} onNext={nextMonth} />

      <DayGrid grid={grid} value={value} today={today} min={min} max={max} onSelectDay={selectDay} />

      <div className={styles.footer}>
        <button type="button" className={styles.resetBtn} onClick={reset}>
          Reset
        </button>
      </div>
    </PopoverFrame>
  )
}
