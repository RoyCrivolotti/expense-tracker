import { formatDayLabel } from '../format'
import { dateSelectionState } from '../tabs/selectionUtils'
import styles from './TransactionList.module.css'

interface DayGroupHeaderProps {
  date: string
  ids: number[]
  selectMode: boolean
  selectedIds: ReadonlySet<number>
  onToggleDate?: (ids: number[]) => void
}

export function DayGroupHeader({
  date,
  ids,
  selectMode,
  selectedIds,
  onToggleDate,
}: DayGroupHeaderProps) {
  const label = formatDayLabel(date)
  if (!selectMode) {
    return <div className={styles.dayHeader}>{label}</div>
  }

  const state = dateSelectionState(selectedIds, ids)
  return (
    <button
      type="button"
      className={styles.dayHeaderSelect}
      data-state={state}
      onClick={() => onToggleDate?.(ids)}
    >
      <span className={styles.dayCheckbox} aria-hidden data-checked={state === 'all'} />
      <span>{label}</span>
      <span className={styles.dayCount}>{ids.length}</span>
    </button>
  )
}
