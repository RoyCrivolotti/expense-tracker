import { BatchBar } from './BatchBar'
import { BatchDeleteConfirm } from './BatchDeleteConfirm'

interface SelectionState {
  selectMode: boolean
  selected: ReadonlySet<number>
  busy: boolean
  pendingBatchDelete: boolean
  requestBatchDelete: () => void
  cancelBatchDelete: () => void
  confirmBatchDelete: () => Promise<void>
}

interface TransactionsSelectFooterProps {
  actionsEnabled: boolean
  selection: SelectionState
}

export function TransactionsSelectFooter({
  actionsEnabled,
  selection,
}: TransactionsSelectFooterProps) {
  if (!actionsEnabled) return null

  return (
    <>
      {selection.selectMode ? (
        <BatchBar
          count={selection.selected.size}
          busy={selection.busy}
          onDelete={selection.requestBatchDelete}
        />
      ) : null}
      {selection.pendingBatchDelete ? (
        <BatchDeleteConfirm
          count={selection.selected.size}
          onConfirm={() => void selection.confirmBatchDelete()}
          onCancel={selection.cancelBatchDelete}
        />
      ) : null}
    </>
  )
}
