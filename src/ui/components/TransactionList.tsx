import { useMemo, type ReactNode } from 'react'
import type { Transaction } from '../../types'
import { groupListRowsByDay, type TransactionListRow } from '../../engine'
import { type Lookup } from '../format'
import { useCollapsedDateGroups } from '../hooks/useCollapsedDateGroups'
import { WINDOW_FROM_ROWS } from '../hooks/windowLayout'
import { DayGroup, type DayGroupShared } from './DayGroup'
import { EmptyState } from './primitives'
import { StatementPaymentRow } from './StatementPaymentRow'
import { TransactionRow } from './TransactionRow'
import { WindowedGroups } from './WindowedGroups'
import styles from './TransactionList.module.css'

const NO_SELECTION: ReadonlySet<number> = new Set()

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

export function TransactionList({ rows, lookup, flat = false, ...props }: TransactionListProps) {
  const [collapsedDates, toggleDateCollapsed] = useCollapsedDateGroups()
  const groups = useMemo(() => (flat ? [] : groupListRowsByDay(rows)), [rows, flat])

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

  const renderListRow = (row: TransactionListRow) => renderRow(row, lookup, props)
  if (flat) return <div className={styles.list}>{rows.map(renderListRow)}</div>

  const shared: DayGroupShared = {
    selectMode: props.selectMode ?? false,
    selectedIds: props.selectedIds ?? NO_SELECTION,
    onToggleCollapse: toggleDateCollapsed,
    onToggleDate: props.onToggleDate,
    onAddForDate: props.onAddForDate,
    renderRow: renderListRow,
  }
  if (rows.length > WINDOW_FROM_ROWS) {
    // Row height depends on the layout of the row, so measurements are not carried over a switch.
    const signature = `${shared.selectMode}-${props.swipeDelete ?? false}`
    return (
      <WindowedGroups
        groups={groups}
        collapsedDates={collapsedDates}
        signature={signature}
        shared={shared}
      />
    )
  }

  return (
    <div className={styles.list}>
      {groups.map((group) => (
        <DayGroup
          key={group.date}
          group={group}
          collapsed={collapsedDates.has(group.date)}
          {...shared}
        >
          {group.rows.map(renderListRow)}
        </DayGroup>
      ))}
    </div>
  )
}
