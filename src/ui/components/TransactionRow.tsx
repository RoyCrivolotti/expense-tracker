import type { Transaction } from '../../types'
import type { Lookup } from '../format'
import { useLongPress } from '../hooks/useLongPress'
import { CloseIcon } from '../icons'
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
  /** A trailing "Clear flag" action — only the Flagged card's preview list sets this. */
  onClearFlag?: (txn: Transaction) => void
  selectMode: boolean
  selected: boolean
  onToggleSelect?: (id: number) => void
  onLongPressSelect?: (id: number) => void
  swipeDelete: boolean
}

/**
 * The plain, non-select, non-swipe row. Pulled out of TransactionRow so its one
 * extra branch (a trailing "Clear flag" action) does not push the parent over
 * the complexity ceiling on top of the selectMode/swipeEnabled branches already
 * there.
 *
 * A trailing action button cannot nest inside the row's own button (invalid
 * HTML, and a tap would fire both), so a row carrying one is a sibling pair in
 * its own wrapper instead of one button — only the Flagged card's preview list
 * passes onClearFlag, so every other caller keeps today's single-button row.
 */
function PlainTransactionRow({
  txn,
  lookup,
  showDate,
  onSelect,
  onClearFlag,
  touchProps,
}: {
  txn: Transaction
  lookup: Lookup
  showDate: boolean
  onSelect?: (txn: Transaction) => void
  onClearFlag?: (txn: Transaction) => void
  touchProps: Record<string, unknown>
}) {
  const row = (
    <button
      type="button"
      className={onClearFlag ? styles.rowMain : styles.row}
      onClick={onSelect ? () => onSelect(txn) : undefined}
      {...touchProps}
    >
      <TransactionRowBody txn={txn} lookup={lookup} showDate={showDate} />
    </button>
  )

  if (!onClearFlag) return row

  return (
    <div className={styles.rowWithAction}>
      {row}
      <button
        type="button"
        className={styles.clearFlagBtn}
        aria-label="Clear flag"
        onClick={() => onClearFlag(txn)}
      >
        <CloseIcon />
      </button>
    </div>
  )
}

/** The optional callbacks SwipeTransactionRow takes, gathered so TransactionRow's
 *  own branch count does not carry all four ternaries itself. */
function swipeRowProps(props: {
  onSelect?: ((txn: Transaction) => void) | undefined
  onDuplicate?: ((txn: Transaction) => void) | undefined
  onDelete?: ((id: number) => Promise<void>) | undefined
  onLongPressSelect?: ((id: number) => void) | undefined
}) {
  return {
    ...(props.onSelect ? { onSelect: props.onSelect } : {}),
    ...(props.onDuplicate ? { onDuplicate: props.onDuplicate } : {}),
    ...(props.onDelete ? { onDelete: props.onDelete } : {}),
    ...(props.onLongPressSelect ? { onLongPressSelect: props.onLongPressSelect } : {}),
  }
}

export function TransactionRow({
  txn,
  lookup,
  showDate,
  onSelect,
  onDuplicate,
  onDelete,
  onClearFlag,
  selectMode,
  selected,
  onToggleSelect,
  onLongPressSelect,
  swipeDelete,
}: TransactionRowProps) {
  const longPress = useLongPress({
    onLongPress: () => onLongPressSelect?.(txn.id),
  })

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
        {...swipeRowProps({ onSelect, onDuplicate, onDelete, onLongPressSelect })}
      />
    )
  }

  const touchProps = onLongPressSelect
    ? { onTouchStart: longPress.onTouchStart, onTouchMove: longPress.onTouchMove, onTouchEnd: longPress.onTouchEnd, onTouchCancel: longPress.onTouchCancel }
    : {}

  return (
    <PlainTransactionRow
      txn={txn}
      lookup={lookup}
      showDate={Boolean(showDate)}
      touchProps={touchProps}
      {...(onSelect ? { onSelect } : {})}
      {...(onClearFlag ? { onClearFlag } : {})}
    />
  )
}
