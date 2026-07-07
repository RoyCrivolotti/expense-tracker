import { formatDayLabel } from '../format'
import { PlusIcon } from '../icons'
import { dateSelectionState } from '../tabs/selectionUtils'
import styles from './TransactionList.module.css'

interface DayGroupHeaderProps {
  date: string
  ids: number[]
  selectMode: boolean
  selectedIds: ReadonlySet<number>
  onToggleDate?: (ids: number[]) => void
  onAdd?: (date: string) => void
}

export function DayGroupHeader({
  date,
  ids,
  selectMode,
  selectedIds,
  onToggleDate,
  onAdd,
}: DayGroupHeaderProps) {
  const label = formatDayLabel(date)
  if (selectMode) {
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

  return (
    <div className={styles.dayHeaderRow}>
      <div className={styles.dayHeader}>{label}</div>
      {onAdd ? (
        <button
          type="button"
          className={`${styles.dayAddBtn} tapActive`}
          onClick={() => onAdd(date)}
          aria-label={`Add transaction on ${label}`}
        >
          <PlusIcon />
        </button>
      ) : null}
    </div>
  )
}
