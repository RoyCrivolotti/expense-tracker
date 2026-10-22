import { useRef, type RefObject } from 'react'
import { CloseIcon } from '../icons'
import { exitVars } from '../hooks/motion'
import { useExit } from '../hooks/usePresence'
import { usePublishHeight } from '../hooks/usePublishHeight'
import styles from './tabs.module.css'

/** Read by the toast and the update prompt, which sit above the bar while it is up. */
const SELECTION_BAR_HEIGHT = '--exp-selection-bar'

/** How the bar leaves: its class, its `--exit-ms`, and no taps once it is on its way. */
function useBarExit(barRef: RefObject<HTMLElement | null>) {
  const { leaving, exitMs } = useExit()
  // Let go as soon as the bar starts to leave, so the toast that is sitting above it
  // glides down with it instead of dropping in one step when it finally unmounts.
  usePublishHeight(barRef, SELECTION_BAR_HEIGHT, !leaving)
  return {
    className: leaving ? `${styles.batchBar} ${styles.batchBarLeaving}` : styles.batchBar,
    style: exitVars(leaving, exitMs),
    inert: leaving,
  }
}

/** "Select all", or "Select 100" when the list holds only some of the rows that match: the rows it selects are those. */
function selectAllLabel(allSelected: boolean, partial: boolean | undefined, loaded: number): string {
  return `${allSelected ? 'Deselect' : 'Select'} ${partial ? loaded : 'all'}`
}

/** The select button as the bar words it itself, when the list has no step of its own to offer. */
function usualSelectAll(allSelected: boolean, partial: boolean | undefined, loaded: number, select: () => void, clear: () => void) {
  return { label: selectAllLabel(allSelected, partial, loaded), onClick: allSelected ? clear : select }
}

/** What is said beside the count: the list's own note, or how many chosen rows a filter hides. */
function selectionNote(note: string | undefined, hiddenCount: number): string {
  return note ?? (hiddenCount > 0 ? `${hiddenCount} not shown` : '')
}

interface BatchBarProps {
  count: number
  totalCount: number
  /** Chosen rows the current filter hides. They stay chosen but are not acted on. */
  hiddenCount?: number
  busy: boolean
  /** More rows match than the list holds, so the button names how many it selects instead of saying all. */
  partial?: boolean | undefined
  /** Replaces the select button, for a list that can select more than the rows it holds (see `BarOverrides`). */
  selectAll?: { label: string; onClick: () => void } | undefined
  /** Said beside the count, in place of the rows a filter hides. */
  note?: string | undefined
  /** The delete cannot be made for this selection. */
  deleteBlocked?: boolean | undefined
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
  partial,
  selectAll,
  note,
  deleteBlocked,
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
  const exit = useBarExit(barRef)
  const deleting = busy && !editOpen
  const canAct = count > 0 && !busy && !readOnly
  const allSelected = totalCount > 0 && count >= totalCount
  const all = selectAll ?? usualSelectAll(allSelected, partial, totalCount, onSelectAll, onDeselectAll)
  const hidden = selectionNote(note, hiddenCount)
  return (
    <div ref={barRef} {...exit}>
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
          {hidden ? <span className={styles.batchHidden}>{hidden}</span> : null}
        </span>
      </div>
      <div className={styles.batchActions}>
        <button
          type="button"
          className={styles.batchSelectAll}
          disabled={busy}
          onClick={all.onClick}
        >
          {all.label}
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
          disabled={!canAct || deleteBlocked}
          onClick={onDelete}
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
