import { useCallback, useRef, useState } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useDismissOnOutsidePointer } from '../charts/useDismissOnOutsidePointer'
import { usePopoverMotion } from '../hooks/usePopoverMotion'
import { usePopoverPosition } from '../hooks/usePopoverPosition'
import { PopoverFrame } from './PopoverFrame'
import { MonthGrid, YearHeader } from './MonthPickerParts'
import styles from './DatePicker.module.css'

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
  const motion = usePopoverMotion(pos)
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

  useFocusTrap(popoverRef, onClose, motion.leaving)
  useDismissOnOutsidePointer(popoverRef, !motion.leaving, onClose, triggerRef)

  return (
    <PopoverFrame popoverRef={popoverRef} pos={pos} motion={motion} classes={styles} label="Choose a month">
      <YearHeader year={viewYear} onPrev={prevYear} onNext={nextYear} />

      <MonthGrid
        viewYear={viewYear}
        valYear={valYear}
        valMonth={valMonth}
        thisY={thisY}
        thisM={thisM}
        onSelectMonth={selectMonth}
      />

      <div className={styles.footer}>
        <button type="button" className={styles.resetBtn} onClick={reset}>
          Reset
        </button>
      </div>
    </PopoverFrame>
  )
}
