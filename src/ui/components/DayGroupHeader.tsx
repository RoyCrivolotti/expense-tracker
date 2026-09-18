import { formatDayLabel } from '../format'
import { PlusIcon } from '../icons'
import { dateSelectionState } from '../tabs/selectionUtils'
import { dayGroupRowsId } from './dayGroupId'
import styles from './TransactionList.module.css'

interface DayGroupHeaderProps {
  date: string
  ids: number[]
  selectMode: boolean
  selectedIds: ReadonlySet<number>
  collapsed: boolean
  onToggleCollapse: () => void
  onToggleDate?: (ids: number[]) => void
  onAdd?: (date: string) => void
}

export function DayGroupHeader({
  date,
  ids,
  selectMode,
  selectedIds,
  collapsed,
  onToggleCollapse,
  onToggleDate,
  onAdd,
}: DayGroupHeaderProps) {
  const label = formatDayLabel(date)
  const collapseBtn = (
    <button
      type="button"
      className={`${styles.dayCollapseBtn} tapActive`}
      onClick={(e) => {
        e.stopPropagation()
        onToggleCollapse()
      }}
      aria-expanded={!collapsed}
      aria-controls={dayGroupRowsId(date)}
      aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${label}`}
    >
      {collapsed ? '▸' : '▾'}
    </button>
  )

  if (selectMode) {
    const state = dateSelectionState(selectedIds, ids)
    return (
      <div className={styles.dayHeaderSelect} data-state={state}>
        {collapseBtn}
        <button type="button" className={styles.daySelectBtn} onClick={() => onToggleDate?.(ids)}>
          <span className={styles.dayCheckbox} aria-hidden data-checked={state === 'all'} />
          <span>{label}</span>
          <span className={styles.dayCount}>{ids.length}</span>
        </button>
      </div>
    )
  }

  return (
    <div className={styles.dayHeaderRow}>
      {collapseBtn}
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
