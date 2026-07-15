import { MonthPicker } from '../components/MonthPicker'
import { RefreshButton } from '../components/RefreshButton'
import styles from '../ExpensesApp.module.css'

interface Props {
  months: string[]
  activeMonth: string
  onMonthChange: (month: string) => void
  showPicker: boolean
  online: boolean
  refreshing: boolean
  onRefresh: () => void
}

export function AppHeaderActions({
  months,
  activeMonth,
  onMonthChange,
  showPicker,
  online,
  refreshing,
  onRefresh,
}: Props) {
  return (
    <div className={styles.headerActions}>
      <RefreshButton onRefresh={onRefresh} refreshing={refreshing} disabled={!online} />
      {showPicker ? (
        <MonthPicker months={months} value={activeMonth} onChange={onMonthChange} />
      ) : null}
    </div>
  )
}
