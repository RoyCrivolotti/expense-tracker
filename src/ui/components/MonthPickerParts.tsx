import styles from './DatePicker.module.css'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

export function YearHeader({ year, onPrev, onNext }: { year: number; onPrev: () => void; onNext: () => void }) {
  return (
    <div className={styles.header}>
      <span className={styles.headerTitle}>{year}</span>
      <div className={styles.headerNav}>
        <button type="button" className={styles.navBtn} onClick={onPrev} aria-label="Previous year">
          ‹
        </button>
        <button type="button" className={styles.navBtn} onClick={onNext} aria-label="Next year">
          ›
        </button>
      </div>
    </div>
  )
}

interface GridProps {
  viewYear: number
  valYear: number
  valMonth: number
  thisY: number
  thisM: number
  onSelectMonth: (month: number) => void
}

export function MonthGrid({ viewYear, valYear, valMonth, thisY, thisM, onSelectMonth }: GridProps) {
  return (
    <div className={styles.monthGrid}>
      {MONTHS.map((label, i) => {
        const m = i + 1
        const isSelected = viewYear === valYear && m === valMonth
        const isCurrent = viewYear === thisY && m === thisM
        const cls = [styles.monthBtn, isCurrent ? styles.monthCurrent : '', isSelected ? styles.monthSelected : '']
          .filter(Boolean)
          .join(' ')
        return (
          <button
            key={label}
            type="button"
            className={cls}
            onClick={() => onSelectMonth(m)}
            aria-label={`${MONTHS[i]} ${viewYear}`}
            aria-pressed={isSelected}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
