import type { BulkTransactionPatch } from '../../data/dataSource'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { BatchBar } from './BatchBar'
import { BatchDeleteConfirm } from './BatchDeleteConfirm'
import { BulkEditSheet } from './BulkEditSheet'

interface SelectionState {
  selectMode: boolean
  selected: ReadonlySet<number>
  hiddenCount: number
  busy: boolean
  pendingBatchDelete: boolean
  pendingBulkEdit: boolean
  toggleSelectMode: () => void
  selectAll: (ids: number[]) => void
  deselectAll: () => void
  requestBatchDelete: () => void
  cancelBatchDelete: () => void
  confirmBatchDelete: () => Promise<void>
  requestBulkEdit: () => void
  cancelBulkEdit: () => void
  confirmBulkEdit: (patch: BulkTransactionPatch) => Promise<void>
}

interface TransactionsSelectFooterProps {
  actionsEnabled: boolean
  actions?: ExpenseActions | undefined
  selection: SelectionState
  visibleIds: number[]
  model: ExpenseModel
}

export function TransactionsSelectFooter({
  actionsEnabled,
  actions,
  selection,
  visibleIds,
  model,
}: TransactionsSelectFooterProps) {
  return (
    <>
      {/* Shown even without write access: going offline mid-selection must still leave a
          way out, since select mode and its locks stay on. */}
      {selection.selectMode ? (
        <BatchBar
          count={selection.selected.size}
          totalCount={visibleIds.length}
          hiddenCount={selection.hiddenCount}
          busy={selection.busy}
          readOnly={!actionsEnabled}
          editOpen={selection.pendingBulkEdit}
          onCancel={selection.toggleSelectMode}
          onSelectAll={() => selection.selectAll(visibleIds)}
          onDeselectAll={selection.deselectAll}
          onEdit={selection.requestBulkEdit}
          onDelete={selection.requestBatchDelete}
        />
      ) : null}
      {actionsEnabled && selection.pendingBatchDelete ? (
        <BatchDeleteConfirm
          count={selection.selected.size}
          hiddenCount={selection.hiddenCount}
          onConfirm={() => void selection.confirmBatchDelete()}
          onCancel={selection.cancelBatchDelete}
        />
      ) : null}
      {actionsEnabled && selection.pendingBulkEdit ? (
        <BulkEditSheet
          count={selection.selected.size}
          hiddenCount={selection.hiddenCount}
          model={model}
          actions={actions}
          busy={selection.busy}
          onApply={(patch) => void selection.confirmBulkEdit(patch)}
          onCancel={selection.cancelBulkEdit}
        />
      ) : null}
    </>
  )
}
