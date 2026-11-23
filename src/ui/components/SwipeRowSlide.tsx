import type { Transaction } from '../../types'
import type { useLongPress } from '../hooks/useLongPress'
import type { useSwipeReveal } from '../hooks/useSwipeReveal'
import type { Lookup } from '../format'
import { TransactionRowBody } from './TransactionRowBody'
import styles from './TransactionList.module.css'

interface Props {
  txn: Transaction
  lookup: Lookup
  showDate: boolean
  swipe: ReturnType<typeof useSwipeReveal>
  longPress: ReturnType<typeof useLongPress>
  onSelect: ((txn: Transaction) => void) | undefined
  onCopy: (() => void) | undefined
  onAskDelete: (() => void) | undefined
}

/** The row's action strip behind it and the sliding row itself. */
export function SwipeRowSlide({ txn, lookup, showDate, swipe, longPress, onSelect, onCopy, onAskDelete }: Props) {
  return (
    <div className={styles.swipeWrap}>
      <div
        className={styles.swipeActions}
        style={{ visibility: swipe.offset < 0 ? 'visible' : 'hidden' }}
        aria-hidden={swipe.offset >= 0}
      >
        {onCopy ? (
          <button type="button" className={styles.copyAction} onClick={onCopy}>
            Copy
          </button>
        ) : null}
        {onAskDelete ? (
          <button type="button" className={styles.deleteAction} onClick={onAskDelete}>
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
  )
}
