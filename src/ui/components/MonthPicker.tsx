import { fullMonthLabel } from '../../engine/dates'
import styles from './MonthPicker.module.css'

interface MonthPickerProps {
  months: string[]
  value: string
  onChange: (month: string) => void
  /** compact: inline pill (header). bar: full-width strip for section toolbars. */
  layout?: 'compact' | 'bar'
  /**
   * Set while the current tab is selecting rows. Changing month would change the list
   * under the selection, which every other control on that list already refuses to do.
   */
  disabled?: boolean
}

export function MonthPicker({
  months,
  value,
  onChange,
  layout = 'compact',
  disabled = false,
}: MonthPickerProps) {
  const index = months.indexOf(value)
  const latestMonth = months[months.length - 1]
  const showLatest = latestMonth !== undefined && value !== latestMonth
  const go = (delta: number) => {
    const next = months[index + delta]
    if (next) onChange(next)
  }
  const rootClass = layout === 'bar' ? `${styles.picker} ${styles.pickerBar}` : styles.picker
  const lockedHint = disabled ? 'Finish or cancel the selection to change month' : undefined
  return (
    <div className={rootClass} title={lockedHint}>
      <button
        type="button"
        onClick={() => go(-1)}
        disabled={disabled || index <= 0}
        aria-label="Previous month"
      >
        ‹
      </button>
      <span className={styles.label}>{fullMonthLabel(value)}</span>
      <button
        type="button"
        onClick={() => go(1)}
        disabled={disabled || index < 0 || index >= months.length - 1}
        aria-label="Next month"
      >
        ›
      </button>
      {showLatest ? (
        <button
          type="button"
          onClick={() => onChange(latestMonth)}
          disabled={disabled}
          aria-label="Go to latest budget month"
        >
          »
        </button>
      ) : null}
    </div>
  )
}
