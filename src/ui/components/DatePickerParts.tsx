import { dayCellToIso, isDateOutOfRange, type DayCell } from './datePickerGrid'
import styles from './DatePicker.module.css'

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export function MonthHeader({
  year,
  month,
  onPrev,
  onNext,
}: {
  year: number
  month: number
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className={styles.header}>
      <span className={styles.headerTitle}>
        {MONTH_NAMES[month - 1]} {year}
      </span>
      <div className={styles.headerNav}>
        <button type="button" className={styles.navBtn} onClick={onPrev} aria-label="Previous month">
          ‹
        </button>
        <button type="button" className={styles.navBtn} onClick={onNext} aria-label="Next month">
          ›
        </button>
      </div>
    </div>
  )
}

interface DayGridProps {
  grid: DayCell[][]
  value: string
  today: string
  min: string | undefined
  max: string | undefined
  onSelectDay: (cell: DayCell) => void
}

/** The weekday row and the grid of day buttons. */
export function DayGrid({ grid, value, today, min, max, onSelectDay }: DayGridProps) {
  return (
    <>
      <div className={styles.weekRow}>
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className={styles.grid} role="grid">
        {grid.map((row, ri) =>
          row.map((cell) => {
            const iso = dayCellToIso(cell)
            const isSelected = iso === value
            const isToday = iso === today
            const outOfRange = isDateOutOfRange(iso, min, max)
            const cls = [
              styles.dayBtn,
              cell.outside ? styles.dayOutside : '',
              isToday ? styles.dayToday : '',
              isSelected ? styles.daySelected : '',
              outOfRange ? styles.dayDisabled : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={`${ri}-${cell.day}-${cell.month}`}
                type="button"
                className={cls}
                disabled={outOfRange}
                onClick={() => onSelectDay(cell)}
                aria-label={`${cell.day} ${MONTH_NAMES[cell.month - 1]} ${cell.year}`}
                aria-pressed={isSelected}
              >
                {cell.day}
              </button>
            )
          }),
        )}
      </div>
    </>
  )
}
