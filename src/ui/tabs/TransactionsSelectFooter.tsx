import { useMemo } from 'react'
import type { BulkTransactionPatch } from '../../data/dataSource'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { PresenceValue } from '../components/Presence'
import { EXIT_MS } from '../hooks/motion'
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
  const { selectMode, pendingBatchDelete, pendingBulkEdit, hiddenCount } = selection
  const count = selection.selected.size
  const total = visibleIds.length
  // What each sheet shows is held while it leaves. Confirming clears the selection, and
  // without this the count in the message would change to zero as the sheet slid away.
  const deleting = useMemo(
    () => (actionsEnabled && pendingBatchDelete ? { count, hiddenCount } : null),
    [actionsEnabled, pendingBatchDelete, count, hiddenCount],
  )
  const editing = useMemo(
    () => (actionsEnabled && pendingBulkEdit ? { count, hiddenCount } : null),
    [actionsEnabled, pendingBulkEdit, count, hiddenCount],
  )
  return (
    <>
      {/* Shown even without write access: going offline mid-selection must still leave a
          way out, since select mode and its locks stay on. */}
      {selectMode ? (
        <BatchBar
          count={count}
          totalCount={total}
          hiddenCount={hiddenCount}
          busy={selection.busy}
          readOnly={!actionsEnabled}
          editOpen={pendingBulkEdit}
          onCancel={selection.toggleSelectMode}
          onSelectAll={() => selection.selectAll(visibleIds)}
          onDeselectAll={selection.deselectAll}
          onEdit={selection.requestBulkEdit}
          onDelete={selection.requestBatchDelete}
        />
      ) : null}
      <PresenceValue value={deleting} exitMs={EXIT_MS.sheet}>
        {(shown) => (
          <BatchDeleteConfirm
            count={shown.count}
            hiddenCount={shown.hiddenCount}
            onConfirm={() => void selection.confirmBatchDelete()}
            onCancel={selection.cancelBatchDelete}
          />
        )}
      </PresenceValue>
      <PresenceValue value={editing} exitMs={EXIT_MS.sheet}>
        {(shown) => (
          <BulkEditSheet
            count={shown.count}
            hiddenCount={shown.hiddenCount}
            model={model}
            actions={actions}
            busy={selection.busy}
            onApply={(patch) => void selection.confirmBulkEdit(patch)}
            onCancel={selection.cancelBulkEdit}
          />
        )}
      </PresenceValue>
    </>
  )
}
