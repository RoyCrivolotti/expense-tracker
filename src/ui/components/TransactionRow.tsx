import type { Transaction } from '../../types'
import type { Lookup } from '../format'
import { SwipeTransactionRow } from './SwipeTransactionRow'
import { TransactionRowBody } from './TransactionRowBody'
import styles from './TransactionList.module.css'

interface TransactionRowProps {
  txn: Transaction
  lookup: Lookup
  showDate?: boolean | undefined
  onSelect?: (txn: Transaction) => void
  onDuplicate?: (txn: Transaction) => void
  onDelete?: (id: number) => Promise<void>
  selectMode: boolean
  selected: boolean
  onToggleSelect?: (id: number) => void
  swipeDelete: boolean
}

export function TransactionRow({
  txn,
  lookup,
  showDate,
  onSelect,
  onDuplicate,
  onDelete,
  selectMode,
  selected,
  onToggleSelect,
  swipeDelete,
}: TransactionRowProps) {
  if (selectMode) {
    return (
      <label className={styles.selectRow}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={selected}
          onChange={() => onToggleSelect?.(txn.id)}
        />
        <span className={styles.rowInner}>
          <TransactionRowBody txn={txn} lookup={lookup} showDate={Boolean(showDate)} />
        </span>
      </label>
    )
  }

  const swipeEnabled = swipeDelete && !selectMode && Boolean(onDelete || onDuplicate)
  if (swipeEnabled) {
    return (
      <SwipeTransactionRow
        txn={txn}
        lookup={lookup}
        showDate={Boolean(showDate)}
        {...(onSelect ? { onSelect } : {})}
        {...(onDuplicate ? { onDuplicate } : {})}
        {...(onDelete ? { onDelete } : {})}
      />
    )
  }

  return (
    <button
      type="button"
      className={styles.row}
      onClick={onSelect ? () => onSelect(txn) : undefined}
    >
      <TransactionRowBody txn={txn} lookup={lookup} showDate={Boolean(showDate)} />
    </button>
  )
}
