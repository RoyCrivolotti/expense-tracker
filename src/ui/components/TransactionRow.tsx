import { useState } from 'react'
import type { Transaction } from '../../types'
import { useSwipeReveal } from '../hooks/useSwipeReveal'
import { STATUS_LABEL, shortDayLabel, type Lookup } from '../format'
import { Money } from './Money'
import { Pill } from './primitives'
import { ConfirmSheet } from './ConfirmSheet'
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

function deleteConfirmMessage(txn: Transaction, lookup: Lookup): string {
  const label = txn.description || lookup.categoryName(txn.categoryId)
  return `“${label}” will be removed permanently.`
}

interface SwipeRowProps {
  txn: Transaction
  lookup: Lookup
  showDate: boolean
  onSelect?: (txn: Transaction) => void
  onDuplicate?: (txn: Transaction) => void
  onDelete?: (id: number) => Promise<void>
}

function SwipeTransactionRow({
  txn,
  lookup,
  showDate,
  onSelect,
  onDuplicate,
  onDelete,
}: SwipeRowProps) {
  const actionCount = (onDuplicate ? 1 : 0) + (onDelete ? 1 : 0)
  const swipe = useSwipeReveal(actionCount > 0, actionCount)
  const [pendingDelete, setPendingDelete] = useState(false)

  const handleCopy = () => {
    onDuplicate?.(txn)
    swipe.reset()
  }

  const confirmDelete = async () => {
    if (!onDelete) return
    setPendingDelete(false)
    swipe.reset()
    await onDelete(txn.id)
  }

  return (
    <>
      <div className={styles.swipeWrap}>
        <div
          className={styles.swipeActions}
          style={{ visibility: swipe.offset < 0 ? 'visible' : 'hidden' }}
          aria-hidden={swipe.offset >= 0}
        >
          {onDuplicate ? (
            <button type="button" className={styles.copyAction} onClick={handleCopy}>
              Copy
            </button>
          ) : null}
          {onDelete ? (
            <button type="button" className={styles.deleteAction} onClick={() => setPendingDelete(true)}>
              Delete
            </button>
          ) : null}
        </div>
        <div
          className={`${styles.swipeSlide}${swipe.isDragging ? ` ${styles.swipeSlideDragging}` : ''}`}
          style={{ transform: `translate3d(${swipe.offset}px, 0, 0)` }}
          onTouchStart={(e) => swipe.onTouchStart(e.touches[0]?.clientX ?? 0)}
          onTouchMove={(e) => swipe.onTouchMove(e.touches[0]?.clientX ?? 0)}
          onTouchEnd={swipe.onTouchEnd}
          onTouchCancel={swipe.onTouchCancel}
        >
          <button
            type="button"
            className={styles.row}
            onClick={() => {
              if (swipe.consumeSuppressedClick()) return
              if (swipe.offset < 0) {
                swipe.reset()
                return
              }
              onSelect?.(txn)
            }}
          >
            <RowBody txn={txn} lookup={lookup} showDate={showDate} />
          </button>
        </div>
      </div>
      {pendingDelete ? (
        <ConfirmSheet
          title="Delete transaction?"
          message={deleteConfirmMessage(txn, lookup)}
          confirmLabel="Delete"
          destructive
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(false)}
        />
      ) : null}
    </>
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
      <RowBody txn={txn} lookup={lookup} showDate={Boolean(showDate)} />
    </button>
  )
}
