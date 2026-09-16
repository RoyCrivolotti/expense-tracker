import { CloseIcon } from '../icons'
import styles from './tabs.module.css'

interface BatchBarProps {
  count: number
  totalCount: number
  /** Chosen rows the current filter hides. They stay chosen but are not acted on. */
  hiddenCount?: number
  busy: boolean
  editOpen: boolean
  onCancel: () => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onEdit: () => void
  onDelete: () => void
}

export function BatchBar({
  count,
  totalCount,
  hiddenCount = 0,
  busy,
  editOpen,
  onCancel,
  onSelectAll,
  onDeselectAll,
  onEdit,
  onDelete,
}: BatchBarProps) {
  const deleting = busy && !editOpen
  const allSelected = totalCount > 0 && count >= totalCount
  return (
    <div className={styles.batchBar}>
      <div className={styles.batchLeft}>
        <button
          type="button"
          className={styles.batchClose}
          onClick={onCancel}
          aria-label="Exit selection mode"
        >
          <CloseIcon />
        </button>
        <span>
          {count} selected
          {hiddenCount > 0 ? (
            <span className={styles.batchHidden}>{hiddenCount} not shown</span>
          ) : null}
        </span>
      </div>
      <div className={styles.batchActions}>
        <button
          type="button"
          className={styles.batchSelectAll}
          disabled={busy}
          onClick={allSelected ? onDeselectAll : onSelectAll}
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
        <button
          type="button"
          className={styles.batchEdit}
          disabled={count === 0 || busy}
          onClick={onEdit}
        >
          Edit
        </button>
        <button
          type="button"
          className={styles.batchDelete}
          disabled={count === 0 || busy}
          onClick={onDelete}
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
