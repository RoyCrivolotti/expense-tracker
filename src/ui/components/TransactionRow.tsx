import type { Transaction } from '../../types'
import { useSwipeReveal } from '../hooks/useSwipeReveal'
import { CopyIcon } from '../icons'
import { STATUS_LABEL, shortDayLabel, type Lookup } from '../format'
import { Money } from './Money'
import { Pill } from './primitives'
import { confirmDeleteOne } from './confirmDelete'
import { CategoryIcon } from './CategoryIcon'
import styles from './TransactionList.module.css'

function RowBody({
  txn,
  lookup,
  showDate = false,
}: {
  txn: Transaction
  lookup: Lookup
  showDate?: boolean
}) {
  const cat = lookup.category(txn.categoryId)
  const metaParts = [
    ...(showDate ? [shortDayLabel(txn.date)] : []),
    lookup.categoryName(txn.categoryId),
    lookup.accountName(txn.accountId),
  ]
  const statusPill =
    txn.status === 'forecast' ? (
      <Pill tone="warning">{STATUS_LABEL.forecast}</Pill>
    ) : txn.status === 'cancelled' ? (
      <Pill>{STATUS_LABEL.cancelled}</Pill>
    ) : null
  return (
    <>
      <CategoryIcon icon={cat?.icon} name={cat?.name ?? '?'} className={styles.catIcon} />
      <span className={styles.body}>
        <span className={styles.desc}>
          {txn.description || lookup.categoryName(txn.categoryId)}
        </span>
        <span className={styles.metaRow}>
          <span className={styles.meta}>{metaParts.join(' · ')}</span>
          {statusPill}
        </span>
      </span>
      <Money cents={txn.amountCents} type={txn.type} className={styles.amount} />
    </>
  )
}

function DuplicateButton({ onDuplicate }: { onDuplicate: () => void }) {
  return (
    <button
      type="button"
      className={`${styles.duplicateBtn} tapActive`}
      onClick={(e) => {
        e.stopPropagation()
        onDuplicate()
      }}
      aria-label="Duplicate transaction"
    >
      <CopyIcon />
    </button>
  )
}

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
          <RowBody txn={txn} lookup={lookup} showDate={Boolean(showDate)} />
        </span>
      </label>
    )
  }

  const rowInner = (
    <div className={styles.rowWrap}>
      <button
        type="button"
        className={styles.row}
        onClick={onSelect ? () => onSelect(txn) : undefined}
      >
        <RowBody txn={txn} lookup={lookup} showDate={Boolean(showDate)} />
      </button>
      {onDuplicate ? <DuplicateButton onDuplicate={() => onDuplicate(txn)} /> : null}
    </div>
  )

  if (!swipeDelete || !onDelete) return rowInner

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
        {rowInner}
      </div>
    </div>
  )
}
