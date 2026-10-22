import { useMemo } from 'react'
import type { BulkTransactionPatch, MatchingTarget } from '../../data/dataSource'
import type { Transaction } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { PresenceValue } from '../components/Presence'
import { EXIT_MS } from '../hooks/motion'
import { BatchBar } from './BatchBar'
import { BatchDeleteConfirm } from './BatchDeleteConfirm'
import { BulkEditSheet } from './BulkEditSheet'
import { summarizeDescriptions } from './bulkEditFields'

interface SelectionState {
  selectMode: boolean
  selected: ReadonlySet<number>
  selectedCount: number
  allMatching: MatchingTarget | null
  matchingOffer: MatchingTarget | null
  hiddenCount: number
  busy: boolean
  pendingBatchDelete: boolean
  pendingBulkEdit: boolean
  toggleSelectMode: () => void
  selectAll: (ids: number[]) => void
  selectMatching: () => void
  deselectAll: () => void
  requestBatchDelete: () => void
  cancelBatchDelete: () => void
  confirmBatchDelete: () => Promise<void>
  requestBulkEdit: () => void
  cancelBulkEdit: () => void
  confirmBulkEdit: (patch: BulkTransactionPatch, labelIdsToAdd: number[]) => Promise<void>
}

interface TransactionsSelectFooterProps {
  actionsEnabled: boolean
  actions?: ExpenseActions | undefined
  selection: SelectionState
  visibleIds: number[]
  /** The rows on screen, which the chosen ones are among: what a rename says it replaces is read from them. */
  rows: readonly Pick<Transaction, 'id' | 'description'>[]
  model: ExpenseModel
  /** More rows match than the list holds. */
  partial?: boolean | undefined
}

export function TransactionsSelectFooter({
  actionsEnabled,
  actions,
  selection,
  visibleIds,
  rows,
  model,
  partial,
}: TransactionsSelectFooterProps) {
  const { selectMode, pendingBatchDelete, pendingBulkEdit, selectedCount: count, allMatching, matchingOffer } = selection
  // Rows picked and then hidden by a filter are not part of an edit on every matching row.
  const hiddenCount = allMatching ? 0 : selection.hiddenCount
  const total = visibleIds.length
  // The count the bar offers is the one the filter was last read to have, when it is more than the list holds.
  const matchingCount = partial && matchingOffer && matchingOffer.expectedCount > total ? matchingOffer.expectedCount : undefined
  const matchingActive = allMatching !== null
  // What each surface shows is held while it leaves. Deleting clears the selection, and
  // without this the words "3 selected" would change to "0 selected" as the bar slid away.
  const bar = useMemo(
    () => (selectMode ? { count, total, hiddenCount, partial: partial ?? false, matchingCount, matchingActive } : null),
    [selectMode, count, total, hiddenCount, partial, matchingCount, matchingActive],
  )
  const deleting = useMemo(
    () => (actionsEnabled && pendingBatchDelete ? { count, hiddenCount } : null),
    [actionsEnabled, pendingBatchDelete, count, hiddenCount],
  )
  const selected = selection.selected
  // Of every matching row only the ones on screen are known, so a rename cannot say what it replaces.
  const editing = useMemo(
    () =>
      actionsEnabled && pendingBulkEdit
        ? { count, hiddenCount, descriptions: matchingActive ? [] : summarizeDescriptions(rows, selected) }
        : null,
    [actionsEnabled, pendingBulkEdit, count, hiddenCount, matchingActive, rows, selected],
  )
  return (
    <>
      {/* Shown even without write access: going offline mid-selection must still leave a
          way out, since select mode and its locks stay on. */}
      <PresenceValue value={bar} exitMs={EXIT_MS.bar}>
        {(shown) => (
          <BatchBar
            count={shown.count}
            totalCount={shown.total}
            hiddenCount={shown.hiddenCount}
            partial={shown.partial}
            matchingCount={shown.matchingCount}
            matchingActive={shown.matchingActive}
            busy={selection.busy}
            readOnly={!actionsEnabled}
            editOpen={pendingBulkEdit}
            onCancel={selection.toggleSelectMode}
            onSelectAll={() => selection.selectAll(visibleIds)}
            onSelectMatching={selection.selectMatching}
            onDeselectAll={selection.deselectAll}
            onEdit={selection.requestBulkEdit}
            onDelete={selection.requestBatchDelete}
          />
        )}
      </PresenceValue>
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
            currentDescriptions={shown.descriptions}
            model={model}
            actions={actions}
            busy={selection.busy}
            onApply={(patch, labelIdsToAdd) => void selection.confirmBulkEdit(patch, labelIdsToAdd)}
            onCancel={selection.cancelBulkEdit}
          />
        )}
      </PresenceValue>
    </>
  )
}
