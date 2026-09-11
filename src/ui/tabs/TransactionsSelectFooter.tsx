import type { BulkTransactionPatch } from '../../data/dataSource'
import type { ExpenseModel } from '../useExpenseData'
import { BatchBar } from './BatchBar'
import { BatchDeleteConfirm } from './BatchDeleteConfirm'
import { BulkEditSheet } from './BulkEditSheet'

interface SelectionState {
  selectMode: boolean
  selected: ReadonlySet<number>
  busy: boolean
  pendingBatchDelete: boolean
  pendingBulkEdit: boolean
  requestBatchDelete: () => void
  cancelBatchDelete: () => void
  confirmBatchDelete: () => Promise<void>
  requestBulkEdit: () => void
  cancelBulkEdit: () => void
  confirmBulkEdit: (patch: BulkTransactionPatch) => Promise<void>
}

interface TransactionsSelectFooterProps {
  actionsEnabled: boolean
  selection: SelectionState
  model: ExpenseModel
}

export function TransactionsSelectFooter({
  actionsEnabled,
  selection,
  model,
}: TransactionsSelectFooterProps) {
  if (!actionsEnabled) return null

  return (
    <>
      {selection.selectMode ? (
        <BatchBar
          count={selection.selected.size}
          busy={selection.busy}
          editOpen={selection.pendingBulkEdit}
          onEdit={selection.requestBulkEdit}
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
      {selection.pendingBulkEdit ? (
        <BulkEditSheet
          count={selection.selected.size}
          model={model}
          busy={selection.busy}
          onApply={(patch) => void selection.confirmBulkEdit(patch)}
          onCancel={selection.cancelBulkEdit}
        />
      ) : null}
    </>
  )
}
