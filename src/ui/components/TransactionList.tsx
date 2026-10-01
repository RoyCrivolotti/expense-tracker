import type { ReactNode } from 'react'
import type { Transaction } from '../../types'
import { groupListRowsByDay, type TransactionListRow } from '../../engine'
import { type Lookup } from '../format'
import { useCollapsedDateGroups } from '../hooks/useCollapsedDateGroups'
import { dayGroupRowsId } from './dayGroupId'
import { EmptyState } from './primitives'
import { DayGroupHeader } from './DayGroupHeader'
import { StatementPaymentRow } from './StatementPaymentRow'
import { TransactionRow } from './TransactionRow'
import styles from './TransactionList.module.css'

interface TransactionListProps {
  rows: TransactionListRow[]
  lookup: Lookup
  flat?: boolean | undefined
  showDate?: boolean | undefined
  onSelect?: (txn: Transaction) => void
  onDuplicate?: (txn: Transaction) => void
  onAddForDate?: (date: string) => void
  onDelete?: (id: number) => Promise<void>
  /** A trailing "Clear flag" action per row — only the Flagged card's preview list sets this. */
  onClearFlag?: (txn: Transaction) => void
  selectMode?: boolean
  selectedIds?: ReadonlySet<number>
  onToggleSelect?: (id: number) => void
  onToggleDate?: (ids: number[]) => void
  onLongPressSelect?: (id: number) => void
  swipeDelete?: boolean
  onClearFilters?: () => void
  onEditStatementPayment?: (row: Extract<TransactionListRow, { kind: 'statement-payment' }>) => void
}

/** The optional per-row callbacks, gathered so renderRow's own branch count
 *  does not grow with every one added — see onClearFlag's addition. */
function optionalRowProps(props: Omit<TransactionListProps, 'rows' | 'lookup'>) {
  return {
    ...(props.onSelect ? { onSelect: props.onSelect } : {}),
    ...(props.onDuplicate ? { onDuplicate: props.onDuplicate } : {}),
    ...(props.onDelete ? { onDelete: props.onDelete } : {}),
    ...(props.onClearFlag ? { onClearFlag: props.onClearFlag } : {}),
    ...(props.onToggleSelect ? { onToggleSelect: props.onToggleSelect } : {}),
    ...(props.onLongPressSelect ? { onLongPressSelect: props.onLongPressSelect } : {}),
  }
}

function renderRow(
  row: TransactionListRow,
  lookup: Lookup,
  props: Omit<TransactionListProps, 'rows' | 'lookup'>,
): ReactNode {
  if (row.kind === 'statement-payment') {
    return (
      <StatementPaymentRow
        key={row.key}
        row={row}
        {...(props.onEditStatementPayment ? { onPress: () => props.onEditStatementPayment?.(row) } : {})}
      />
    )
  }
  return (
    <TransactionRow
      key={row.txn.id}
      txn={row.txn}
      lookup={lookup}
      showDate={Boolean(props.showDate)}
      selectMode={props.selectMode ?? false}
      selected={props.selectedIds?.has(row.txn.id) ?? false}
      swipeDelete={props.swipeDelete ?? false}
      {...optionalRowProps(props)}
    />
  )
}

export function TransactionList({ rows, lookup, ...props }: TransactionListProps) {
  const [collapsedDates, toggleDateCollapsed] = useCollapsedDateGroups()

  if (rows.length === 0) {
    return (
      <EmptyState
        actionLabel={props.onClearFilters ? 'Clear filters' : undefined}
        onAction={props.onClearFilters}
      >
        No transactions match these filters.
      </EmptyState>
    )
  }

  const groups = groupListRowsByDay(rows)
  if (props.flat) {
    return <div className={styles.list}>{rows.map((row) => renderRow(row, lookup, props))}</div>
  }

  return (
    <div className={styles.list}>
      {groups.map((group) => {
        const ids = group.rows.flatMap((row) =>
          row.kind === 'transaction' ? [row.txn.id] : [],
        )
        const collapsed = collapsedDates.has(group.date)
        return (
          <div key={group.date} className={styles.group}>
            <DayGroupHeader
              date={group.date}
              ids={ids}
              selectMode={props.selectMode ?? false}
              selectedIds={props.selectedIds ?? new Set()}
              collapsed={collapsed}
              onToggleCollapse={() => toggleDateCollapsed(group.date)}
              {...(props.onToggleDate ? { onToggleDate: props.onToggleDate } : {})}
              {...(props.onAddForDate && !props.selectMode ? { onAdd: props.onAddForDate } : {})}
            />
            <div
              id={dayGroupRowsId(group.date)}
              className={collapsed ? `${styles.dayRows} ${styles.dayRowsCollapsed}` : styles.dayRows}
              // Kept in the DOM so it can fold; `inert` keeps touch, focus and screen
              // readers out of rows that are out of sight.
              inert={collapsed}
            >
              <div className={styles.dayRowsInner}>
                {group.rows.map((row) => renderRow(row, lookup, props))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
