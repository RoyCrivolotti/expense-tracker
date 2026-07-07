import type { Transaction } from '../../types'
import { groupByDay } from '../../engine/transactions'
import { type Lookup } from '../format'
import { EmptyState } from './primitives'
import { DayGroupHeader } from './DayGroupHeader'
import { TransactionRow } from './TransactionRow'
import styles from './TransactionList.module.css'

interface TransactionListProps {
  transactions: Transaction[]
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
}

export function TransactionList({
  transactions,
  lookup,
  flat = false,
  showDate = false,
  onSelect,
  onDuplicate,
  onAddForDate,
  onDelete,
  selectMode = false,
  selectedIds,
  onToggleSelect,
  onToggleDate,
  swipeDelete = false,
  onClearFilters,
}: TransactionListProps) {
  if (transactions.length === 0) {
    return (
      <EmptyState
        actionLabel={onClearFilters ? 'Clear filters' : undefined}
        onAction={onClearFilters}
      >
        No transactions match these filters.
      </EmptyState>
    )
  }

  const groups = groupByDay(transactions)
  if (flat) {
    return (
      <div className={styles.list}>
        {transactions.map((txn) => (
          <TransactionRow
            key={txn.id}
            txn={txn}
            lookup={lookup}
            showDate={showDate}
            selectMode={selectMode}
            selected={selectedIds?.has(txn.id) ?? false}
            swipeDelete={swipeDelete}
            {...(onSelect ? { onSelect } : {})}
            {...(onDuplicate ? { onDuplicate } : {})}
            {...(onDelete ? { onDelete } : {})}
            {...(onToggleSelect ? { onToggleSelect } : {})}
          />
        ))}
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {groups.map((group) => {
        const ids = group.transactions.map((t) => t.id)
        return (
          <div key={group.date} className={styles.group}>
            <DayGroupHeader
              date={group.date}
              ids={ids}
              selectMode={selectMode}
              selectedIds={selectedIds ?? new Set()}
              {...(onToggleDate ? { onToggleDate } : {})}
              {...(onAddForDate && !selectMode ? { onAdd: onAddForDate } : {})}
            />
            {group.transactions.map((txn) => (
              <TransactionRow
                key={txn.id}
                txn={txn}
                lookup={lookup}
                selectMode={selectMode}
                selected={selectedIds?.has(txn.id) ?? false}
                swipeDelete={swipeDelete}
                {...(onSelect ? { onSelect } : {})}
                {...(onDuplicate ? { onDuplicate } : {})}
                {...(onDelete ? { onDelete } : {})}
                {...(onToggleSelect ? { onToggleSelect } : {})}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
