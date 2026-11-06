import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useDismissOnOutsidePointer } from '../charts/useDismissOnOutsidePointer'
import { usePopoverMotion } from '../hooks/usePopoverMotion'
import { usePopoverPosition } from '../hooks/usePopoverPosition'
import { MAX_ROLLOVER_DAY, ordinalDay } from './dayOfMonth'
import styles from './DatePicker.module.css'

const DAYS = Array.from({ length: MAX_ROLLOVER_DAY }, (_, i) => i + 1)
const COLUMNS = 7

interface Props {
  value: number
  triggerRef: React.RefObject<HTMLElement | null>
  onSelect: (day: number) => void
  onClose: () => void
}

/** Moves focus between the day buttons: a day with left and right, a week with up and down. */
function useGridArrowKeys(popoverRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const step =
        e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? COLUMNS : e.key === 'ArrowUp' ? -COLUMNS : 0
      if (step === 0) return
      const buttons = Array.from(popoverRef.current?.querySelectorAll<HTMLElement>('[role="grid"] button') ?? [])
      const idx = buttons.indexOf(document.activeElement as HTMLElement)
      if (idx === -1) return
      const next = buttons[idx + step]
      if (!next) return
      e.preventDefault()
      next.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [popoverRef])
}

/** Days 1 to 28 laid out as four calendar weeks, the same shape as the date picker's grid. */
export function DayOfMonthPopover({ value, triggerRef, onSelect, onClose }: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const pos = usePopoverPosition(triggerRef, popoverRef)
  const motion = usePopoverMotion(pos)

  const select = (day: number) => {
    onSelect(day)
    onClose()
  }

  useFocusTrap(popoverRef, onClose, motion.leaving)
  useDismissOnOutsidePointer(popoverRef, !motion.leaving, onClose, triggerRef)

  useGridArrowKeys(popoverRef)

  return createPortal(
    <div
      ref={popoverRef}
      className={motion.leaving ? `${styles.popover} ${styles.popoverLeaving}` : styles.popover}
      {...motion.attrs}
      style={{
        ...motion.exit,
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
      aria-label="Choose the day the budget month starts"
    >
      <div className={styles.header}>
        <span className={styles.headerTitle}>Day of the month</span>
      </div>

      <div className={styles.grid} role="grid">
        {DAYS.map((day) => {
          const isSelected = day === value
          return (
            <button
              key={day}
              type="button"
              className={isSelected ? `${styles.dayBtn} ${styles.daySelected}` : styles.dayBtn}
              onClick={() => select(day)}
              aria-label={ordinalDay(day)}
              aria-pressed={isSelected}
            >
              {day}
            </button>
          )
        })}
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.resetBtn} onClick={() => select(1)}>
          Calendar months
        </button>
      </div>
    </div>,
    document.body,
  )
}
