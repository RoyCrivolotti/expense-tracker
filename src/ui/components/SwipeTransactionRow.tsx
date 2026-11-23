import { useState } from 'react'
import type { Transaction } from '../../types'
import { useLongPress } from '../hooks/useLongPress'
import { useSwipeReveal } from '../hooks/useSwipeReveal'
import type { Lookup } from '../format'
import { EXIT_MS, foldDone } from '../hooks/motion'
import { useToast } from '../hooks/useToast'
import { ConfirmSheet } from './ConfirmSheet'
import { PresenceValue } from './Presence'
import { SwipeRowSlide } from './SwipeRowSlide'
import styles from './TransactionList.module.css'

function deleteConfirmMessage(
  txn: Transaction,
  lookup: Lookup,
): string {
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

/**
 * The delete flow of one row: ask, fold the row away, then send the delete and bring the row
 * back with a message if it fails.
 */
function useFoldDelete(
  txn: Transaction,
  onDelete: ((id: number) => Promise<void>) | undefined,
  reset: () => void,
) {
  const { showToast } = useToast()
  const [pendingDelete, setPendingDelete] = useState(false)
  const [folding, setFolding] = useState(false)

  const confirmDelete = async () => {
    if (!onDelete) return
    setPendingDelete(false)
    reset()
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
  return { pendingDelete, setPendingDelete, folding, confirmDelete }
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
  const { pendingDelete, setPendingDelete, folding, confirmDelete } = useFoldDelete(txn, onDelete, swipe.reset)

  const handleCopy = () => {
    onDuplicate?.(txn)
    swipe.reset()
  }

  return (
    <>
      <div className={folding ? `${styles.rowFold} ${styles.rowFolded}` : styles.rowFold} inert={folding}>
        <div className={styles.rowFoldInner}>
          <SwipeRowSlide
            txn={txn}
            lookup={lookup}
            showDate={showDate}
            swipe={swipe}
            longPress={longPress}
            onSelect={onSelect}
            onCopy={onDuplicate ? handleCopy : undefined}
            onAskDelete={onDelete ? () => setPendingDelete(true) : undefined}
          />
        </div>
      </div>
      {/* A plain boolean Presence would run deleteConfirmMessage as eager JSX on every
          render of every row in this unvirtualized list; PresenceValue's function-as-
          children form only builds it once a delete is actually pending. */}
      <PresenceValue value={pendingDelete ? txn : null} exitMs={EXIT_MS.sheet}>
        {(heldTxn) => (
          <ConfirmSheet
            title="Delete transaction?"
            message={deleteConfirmMessage(heldTxn, lookup)}
            confirmLabel="Delete"
            destructive
            onConfirm={() => void confirmDelete()}
            onCancel={() => setPendingDelete(false)}
          />
        )}
      </PresenceValue>
    </>
  )
}
