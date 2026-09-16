import { fullMonthLabel } from '../../engine/dates'
import styles from './MonthPicker.module.css'

interface MonthPickerProps {
  months: string[]
  value: string
  onChange: (month: string) => void
  /** compact: inline pill (header). bar: full-width strip for section toolbars. */
  layout?: 'compact' | 'bar'
  /**
   * Set while the current tab is selecting rows. Changing month would change the list under
   * the selection, which every other control on that list already refuses to do. The buttons
   * stay pressable so `onLockedPress` can say why: a disabled button never gets the click.
   */
  locked?: boolean
  onLockedPress?: (() => void) | undefined
}

export function MonthPicker({
  months,
  value,
  onChange,
  layout = 'compact',
  locked = false,
  onLockedPress,
}: MonthPickerProps) {
  const index = months.indexOf(value)
  const latestMonth = months[months.length - 1]
  const showLatest = latestMonth !== undefined && value !== latestMonth
  const go = (delta: number) => {
    const next = months[index + delta]
    if (next) onChange(next)
  }
  // Locked, all three answer alike, even one already at the end of the range.
  const press = (action: () => void) => () => {
    if (locked) onLockedPress?.()
    else action()
  }
  const lockedState = locked ? ({ 'aria-disabled': true } as const) : {}
  const rootClass = layout === 'bar' ? `${styles.picker} ${styles.pickerBar}` : styles.picker
  return (
    <div className={rootClass}>
      <button
        type="button"
        onClick={press(() => go(-1))}
        disabled={!locked && index <= 0}
        {...lockedState}
        aria-label="Previous month"
      >
        ‹
      </button>
      <span className={styles.label}>{fullMonthLabel(value)}</span>
      <button
        type="button"
        onClick={press(() => go(1))}
        disabled={!locked && (index < 0 || index >= months.length - 1)}
        {...lockedState}
        aria-label="Next month"
      >
        ›
      </button>
      {showLatest ? (
        <button
          type="button"
          onClick={press(() => onChange(latestMonth))}
          {...lockedState}
          aria-label="Go to latest budget month"
        >
          »
        </button>
      ) : null}
    </div>
  )
}
