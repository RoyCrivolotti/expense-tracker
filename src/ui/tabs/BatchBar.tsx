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

/** What the count leaves out: rows a filter hides, or the delete that every matching row cannot have. */
function SelectionNote({ matchingActive, hiddenCount }: { matchingActive: boolean; hiddenCount: number }) {
  if (matchingActive) return <span className={styles.batchHidden}>edit only</span>
  return hiddenCount > 0 ? <span className={styles.batchHidden}>{hiddenCount} not shown</span> : null
}

interface SelectAllProps {
  allSelected: boolean
  loaded: number
  partial: boolean | undefined
  busy: boolean
  matchingCount: number | undefined
  matchingActive: boolean
  onSelectAll: () => void
  onSelectMatching: (() => void) | undefined
  onDeselectAll: () => void
}

/**
 * One button that takes the next step towards everything: the rows the list holds, then every row the filter
 * matches when that is more (and may be edited as a whole), then back to nothing. Each label says how many it selects.
 */
function SelectAllButton({ allSelected, loaded, partial, busy, matchingCount, matchingActive, onSelectAll, onSelectMatching, onDeselectAll }: SelectAllProps) {
  const choosing = !matchingActive && allSelected && matchingCount !== undefined && onSelectMatching !== undefined
  const [label, onClick] = matchingActive
    ? ['Deselect all', onDeselectAll]
    : choosing
      ? [`Select all ${matchingCount}`, onSelectMatching]
      : [selectAllLabel(allSelected, partial, loaded), allSelected ? onDeselectAll : onSelectAll]
  return (
    <button type="button" className={styles.batchSelectAll} disabled={busy} onClick={onClick}>
      {label}
    </button>
  )
}

interface BatchBarProps {
  count: number
  totalCount: number
  /** Chosen rows the current filter hides. They stay chosen but are not acted on. */
  hiddenCount?: number
  busy: boolean
  /** More rows match than the list holds, so the button names how many it selects instead of saying all. */
  partial?: boolean | undefined
  /** How many rows match, when the list holds only some and the filter may be edited as a whole: they can be selected in one go. */
  matchingCount?: number | undefined
  /** Every matching row is selected, the ones the list has not read included. They can be edited, not deleted. */
  matchingActive?: boolean | undefined
  /** Offline or otherwise without write access: nothing can be edited or deleted. */
  readOnly?: boolean
  editOpen: boolean
  onCancel: () => void
  onSelectAll: () => void
  onSelectMatching?: (() => void) | undefined
  onDeselectAll: () => void
  onEdit: () => void
  onDelete: () => void
}

export function BatchBar({
  count,
  totalCount,
  hiddenCount = 0,
  partial,
  matchingCount,
  matchingActive = false,
  busy,
  readOnly = false,
  editOpen,
  onCancel,
  onSelectAll,
  onSelectMatching,
  onDeselectAll,
  onEdit,
  onDelete,
}: BatchBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const exit = useBarExit(barRef)
  const deleting = busy && !editOpen
  const canAct = count > 0 && !busy && !readOnly
  const allSelected = totalCount > 0 && count >= totalCount
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
          <SelectionNote matchingActive={matchingActive} hiddenCount={hiddenCount} />
        </span>
      </div>
      <div className={styles.batchActions}>
        <SelectAllButton
          allSelected={allSelected}
          loaded={totalCount}
          partial={partial}
          busy={busy}
          matchingCount={matchingCount}
          matchingActive={matchingActive}
          onSelectAll={onSelectAll}
          onSelectMatching={onSelectMatching}
          onDeselectAll={onDeselectAll}
        />
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
          disabled={!canAct || matchingActive}
          onClick={onDelete}
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
