import { useRef } from 'react'
import { CloseIcon } from '../icons'
import { usePublishHeight } from '../hooks/usePublishHeight'
import styles from './tabs.module.css'

/** Read by the toast and the update prompt, which sit above the bar while it is up. */
const SELECTION_BAR_HEIGHT = '--exp-selection-bar'

interface BatchBarProps {
  count: number
  totalCount: number
  /** Chosen rows the current filter hides. They stay chosen but are not acted on. */
  hiddenCount?: number
  busy: boolean
  /** Offline or otherwise without write access: nothing can be edited or deleted. */
  readOnly?: boolean
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
  readOnly = false,
  editOpen,
  onCancel,
  onSelectAll,
  onDeselectAll,
  onEdit,
  onDelete,
}: BatchBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  usePublishHeight(barRef, SELECTION_BAR_HEIGHT)
  const deleting = busy && !editOpen
  const canAct = count > 0 && !busy && !readOnly
  const allSelected = totalCount > 0 && count >= totalCount
  return (
    <div ref={barRef} className={styles.batchBar}>
      <div className={styles.batchLeft}>
        <button
          type="button"
          className={styles.batchClose}
          onClick={onCancel}
          disabled={busy}
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
          disabled={!canAct}
          onClick={onEdit}
        >
          Edit
        </button>
        <button
          type="button"
          className={styles.batchDelete}
          disabled={!canAct}
          onClick={onDelete}
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
