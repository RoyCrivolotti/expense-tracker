import { useState } from 'react'
import type { Transaction } from '../../types'
import { useLongPress } from '../hooks/useLongPress'
import { useSwipeReveal } from '../hooks/useSwipeReveal'
import type { Lookup } from '../format'
import { EXIT_MS, foldDone } from '../hooks/motion'
import { useToast } from '../hooks/useToast'
import { ConfirmSheet } from './ConfirmSheet'
import { Presence } from './Presence'
import { TransactionRowBody } from './TransactionRowBody'
import styles from './TransactionList.module.css'

function deleteConfirmMessage(txn: Transaction, lookup: Lookup): string {
  const label = txn.description || lookup.categoryName(txn.categoryId)
  return `"${label}" will be removed permanently.`
}

interface SwipeRowProps {
  txn: Transaction
  lookup: Lookup
  showDate: boolean
  onSelect?: (txn: Transaction) => void
  onDuplicate?: (txn: Transaction) => void
  onDelete?: (id: number) => Promise<void>
  onLongPressSelect?: (id: number) => void
}

export function SwipeTransactionRow({
  txn,
  lookup,
  showDate,
  onSelect,
  onDuplicate,
  onDelete,
  onLongPressSelect,
}: SwipeRowProps) {
  const actionCount = (onDuplicate ? 1 : 0) + (onDelete ? 1 : 0)
  const swipe = useSwipeReveal(actionCount > 0, actionCount)
  const longPress = useLongPress({
    onLongPress: () => onLongPressSelect?.(txn.id),
  })
  const { showToast } = useToast()
  const [pendingDelete, setPendingDelete] = useState(false)
  const [folding, setFolding] = useState(false)

  const handleCopy = () => {
    onDuplicate?.(txn)
    swipe.reset()
  }

  const confirmDelete = async () => {
    if (!onDelete) return
    setPendingDelete(false)
    swipe.reset()
    // Folds away first and asks afterwards: sent at once, an answer that beat the fold (the
    // server is often quicker than 180ms) would have the list drop the row halfway down. If
    // the delete fails the row is still there, so bring it back and say why, as a batch
    // delete does; a row that folded and then reappeared would otherwise look like a glitch.
    setFolding(true)
    try {
      await foldDone()
      await onDelete(txn.id)
    } catch (error) {
      setFolding(false)
      showToast(error instanceof Error ? error.message : 'Could not delete', 'error')
    }
  }

  return (
    <>
      <div className={folding ? `${styles.rowFold} ${styles.rowFolded}` : styles.rowFold} inert={folding}>
        <div className={styles.rowFoldInner}>
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
              onTouchStart={(e) => {
                swipe.onTouchStart(e.touches[0]?.clientX ?? 0)
                longPress.onTouchStart(e)
              }}
              onTouchMove={(e) => {
                swipe.onTouchMove(e.touches[0]?.clientX ?? 0)
                longPress.onTouchMove(e)
              }}
              onTouchEnd={(e) => {
                swipe.onTouchEnd()
                longPress.onTouchEnd(e)
              }}
              onTouchCancel={() => {
                swipe.onTouchCancel()
                longPress.onTouchCancel()
              }}
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
                <TransactionRowBody txn={txn} lookup={lookup} showDate={showDate} />
              </button>
            </div>
          </div>
        </div>
      </div>
      <Presence show={pendingDelete} exitMs={EXIT_MS.sheet}>
        <ConfirmSheet
          title="Delete transaction?"
          message={deleteConfirmMessage(txn, lookup)}
          confirmLabel="Delete"
          destructive
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(false)}
        />
      </Presence>
    </>
  )
}
