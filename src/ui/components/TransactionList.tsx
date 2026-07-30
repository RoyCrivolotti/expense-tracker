import type { ReactNode } from 'react'
import type { Transaction } from '../../types'
import { groupListRowsByDay, type TransactionListRow } from '../../engine'
import { type Lookup } from '../format'
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
  selectMode?: boolean
  selectedIds?: ReadonlySet<number>
  onToggleSelect?: (id: number) => void
  onToggleDate?: (ids: number[]) => void
  swipeDelete?: boolean
  onClearFilters?: () => void
  onEditStatementPayment?: (row: Extract<TransactionListRow, { kind: 'statement-payment' }>) => void
}

function rowBudgetMonth(row: TransactionListRow): string {
  return row.kind === 'transaction' ? row.txn.budgetMonth : row.budgetMonth
}

/** Whether the rows on screen mix budget months, which is when per-row pills earn their space. */
function spansBudgetMonths(rows: TransactionListRow[]): boolean {
  return new Set(rows.map(rowBudgetMonth)).size > 1
}

function renderRow(
  row: TransactionListRow,
  lookup: Lookup,
  props: Omit<TransactionListProps, 'rows' | 'lookup'>,
  showBudgetMonth: boolean,
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
      showBudgetMonth={showBudgetMonth}
      selectMode={props.selectMode ?? false}
      selected={props.selectedIds?.has(row.txn.id) ?? false}
      swipeDelete={props.swipeDelete ?? false}
      {...(props.onSelect ? { onSelect: props.onSelect } : {})}
      {...(props.onDuplicate ? { onDuplicate: props.onDuplicate } : {})}
      {...(props.onDelete ? { onDelete: props.onDelete } : {})}
      {...(props.onToggleSelect ? { onToggleSelect: props.onToggleSelect } : {})}
    />
  )
}

export function TransactionList({ rows, lookup, ...props }: TransactionListProps) {
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

  const mixedMonths = spansBudgetMonths(rows)
  const groups = groupListRowsByDay(rows)
  if (props.flat) {
    return (
      <div className={styles.list}>
        {rows.map((row) => renderRow(row, lookup, props, mixedMonths))}
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {groups.map((group) => {
        const ids = group.rows.flatMap((row) =>
          row.kind === 'transaction' ? [row.txn.id] : [],
        )
        return (
          <div key={group.date} className={styles.group}>
            <DayGroupHeader
              date={group.date}
              ids={ids}
              selectMode={props.selectMode ?? false}
              selectedIds={props.selectedIds ?? new Set()}
              {...(props.onToggleDate ? { onToggleDate: props.onToggleDate } : {})}
              {...(props.onAddForDate && !props.selectMode ? { onAdd: props.onAddForDate } : {})}
            />
            {group.rows.map((row) => renderRow(row, lookup, props, mixedMonths))}
          </div>
        )
      })}
    </div>
  )
}
