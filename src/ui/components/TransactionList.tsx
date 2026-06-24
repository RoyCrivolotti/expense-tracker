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
  onSelect?: (txn: Transaction) => void
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
  onSelect,
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
