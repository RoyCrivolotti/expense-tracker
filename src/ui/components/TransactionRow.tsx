import type { Transaction } from '../../types'
import { useSwipeReveal } from '../hooks/useSwipeReveal'
import { STATUS_LABEL, type Lookup } from '../format'
import { Money } from './Money'
import { Pill } from './primitives'
import { confirmDeleteOne } from './confirmDelete'
import styles from './TransactionList.module.css'

function RowBody({ txn, lookup }: { txn: Transaction; lookup: Lookup }) {
  return (
    <>
      <span className={styles.dot} data-type={txn.type} aria-hidden />
      <span className={styles.body}>
        <span className={styles.desc}>
          {txn.description || lookup.categoryName(txn.categoryId)}
        </span>
        <span className={styles.meta}>
          {lookup.categoryName(txn.categoryId)} · {lookup.accountName(txn.accountId)}
          {txn.status === 'forecast' && <Pill tone="warning">{STATUS_LABEL.forecast}</Pill>}
          {txn.status === 'cancelled' && <Pill>{STATUS_LABEL.cancelled}</Pill>}
        </span>
      </span>
      <Money cents={txn.amountCents} type={txn.type} className={styles.amount} />
    </>
  )
}

interface TransactionRowProps {
  txn: Transaction
  lookup: Lookup
  onSelect?: (txn: Transaction) => void
  onDelete?: (id: number) => Promise<void>
  selectMode: boolean
  selected: boolean
  onToggleSelect?: (id: number) => void
  swipeDelete: boolean
}

export function TransactionRow({
  txn,
  lookup,
  onSelect,
  onDelete,
  selectMode,
  selected,
  onToggleSelect,
  swipeDelete,
}: TransactionRowProps) {
  const swipe = useSwipeReveal(Boolean(swipeDelete && onDelete && !selectMode))

  const handleDelete = async () => {
    if (!onDelete || !confirmDeleteOne()) return
    swipe.reset()
    await onDelete(txn.id)
  }

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
          <RowBody txn={txn} lookup={lookup} />
        </span>
      </label>
    )
  }

  const row = (
    <button
      type="button"
      className={styles.row}
      onClick={onSelect ? () => onSelect(txn) : undefined}
    >
      <RowBody txn={txn} lookup={lookup} />
    </button>
  )

  if (!swipeDelete || !onDelete) return row

  return (
    <div className={styles.swipeWrap}>
      <button type="button" className={styles.deleteAction} onClick={() => void handleDelete()}>
        Delete
      </button>
      <div
        className={styles.swipeSlide}
        style={{ transform: `translateX(${swipe.offset}px)` }}
        onTouchStart={(e) => swipe.onTouchStart(e.touches[0]?.clientX ?? 0)}
        onTouchMove={(e) => swipe.onTouchMove(e.touches[0]?.clientX ?? 0)}
        onTouchEnd={swipe.onTouchEnd}
      >
        {row}
      </div>
    </div>
  )
}
