import { MonthPicker } from '../components/MonthPicker'
import { RefreshButton } from '../components/RefreshButton'
import styles from '../ExpensesApp.module.css'

interface Props {
  months: string[]
  activeMonth: string
  onMonthChange: (month: string) => void
  showPicker: boolean
  /** The current tab is selecting rows, so the month must not change under it. */
  pickerLocked?: boolean
  /** Pressing the locked picker: say why nothing happens. */
  onLockedPickerPress?: (() => void) | undefined
  online: boolean
  refreshing: boolean
  onRefresh: () => void
}

export function AppHeaderActions({
  months,
  activeMonth,
  onMonthChange,
  showPicker,
  pickerLocked = false,
  onLockedPickerPress,
  online,
  refreshing,
  onRefresh,
}: Props) {
  return (
    <div className={styles.headerActions}>
      <RefreshButton onRefresh={onRefresh} refreshing={refreshing} disabled={!online} />
      {showPicker ? (
        <MonthPicker
          months={months}
          value={activeMonth}
          onChange={onMonthChange}
          locked={pickerLocked}
          onLockedPress={onLockedPickerPress}
        />
      ) : null}
    </div>
  )
}
