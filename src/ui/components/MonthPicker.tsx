import { fullMonthLabel } from '../../engine/dates'
import styles from './MonthPicker.module.css'

interface MonthPickerProps {
  months: string[]
  value: string
  onChange: (month: string) => void
}

export function MonthPicker({ months, value, onChange }: MonthPickerProps) {
  const index = months.indexOf(value)
  const go = (delta: number) => {
    const next = months[index + delta]
    if (next) onChange(next)
  }
  return (
    <div className={styles.picker}>
      <button
        type="button"
        onClick={() => go(-1)}
        disabled={index <= 0}
        aria-label="Previous month"
      >
        ‹
      </button>
      <span className={styles.label}>{fullMonthLabel(value)}</span>
      <button
        type="button"
        onClick={() => go(1)}
        disabled={index < 0 || index >= months.length - 1}
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  )
}
