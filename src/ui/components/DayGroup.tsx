import type { ReactNode } from 'react'
import type { ListDayGroup, TransactionListRow } from '../../engine'
import { dayGroupRowsId } from './dayGroupId'
import { DayGroupHeader } from './DayGroupHeader'
import styles from './TransactionList.module.css'

/** What every day group of one list shares, whether the list is windowed or not. */
export interface DayGroupShared {
  selectMode: boolean
  selectedIds: ReadonlySet<number>
  onToggleCollapse: (date: string) => void
  onToggleDate?: ((ids: number[]) => void) | undefined
  onAddForDate?: ((date: string) => void) | undefined
  renderRow: (row: TransactionListRow) => ReactNode
}

interface DayGroupProps extends Omit<DayGroupShared, 'renderRow'> {
  group: ListDayGroup
  collapsed: boolean
  /** The group's rows, or the part of them that is in the DOM. */
  children: ReactNode
}

/** One day: its sticky header and its rows, which fold into the header. It must stay one element for the header to stick. */
export function DayGroup({
  group,
  collapsed,
  selectMode,
  selectedIds,
  onToggleCollapse,
  onToggleDate,
  onAddForDate,
  children,
}: DayGroupProps) {
  const ids = group.rows.flatMap((row) => (row.kind === 'transaction' ? [row.txn.id] : []))
  return (
    <div className={styles.group}>
      <DayGroupHeader
        date={group.date}
        ids={ids}
        selectMode={selectMode}
        selectedIds={selectedIds}
        collapsed={collapsed}
        onToggleCollapse={() => onToggleCollapse(group.date)}
        {...(onToggleDate ? { onToggleDate } : {})}
        {...(onAddForDate && !selectMode ? { onAdd: onAddForDate } : {})}
      />
      <div
        id={dayGroupRowsId(group.date)}
        className={collapsed ? `${styles.dayRows} ${styles.dayRowsCollapsed}` : styles.dayRows}
        // Kept in the DOM so it can fold; `inert` keeps touch, focus and screen
        // readers out of rows that are out of sight.
        inert={collapsed}
      >
        <div className={styles.dayRowsInner}>{children}</div>
      </div>
    </div>
  )
}
