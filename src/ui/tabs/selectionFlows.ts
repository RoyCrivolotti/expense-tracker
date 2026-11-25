import type { Dispatch, SetStateAction } from 'react'
import type { BulkTransactionPatch } from '../../data/dataSource'
import type { ExpenseActions } from '../actions'
import type { ToastApi } from '../hooks/useToast'
import { bulkOutcomeCopy } from './selectionCopy'
import type { EditRows } from './useTransactionSelection'

interface FlowArgs {
  actions: ExpenseActions | undefined
  selected: ReadonlySet<number>
  setBusy: (busy: boolean) => void
  exitSelect: () => void
  showToast: ToastApi['showToast']
}

/** Asking for, cancelling and confirming a delete of the chosen rows. */
export function makeDeleteFlow(
  { actions, selected, setBusy, exitSelect, showToast }: FlowArgs,
  setPendingBatchDelete: Dispatch<SetStateAction<boolean>>,
) {
  const requestBatchDelete = () => {
    if (!actions || selected.size === 0) return
    setPendingBatchDelete(true)
  }

  const cancelBatchDelete = () => setPendingBatchDelete(false)

  const confirmBatchDelete = async () => {
    if (!actions || selected.size === 0) return
    const count = selected.size
    setPendingBatchDelete(false)
    setBusy(true)
    try {
      const deleted = await actions.deleteTransactions([...selected])
      exitSelect()
      showToast(bulkOutcomeCopy('Deleted', deleted, count), 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete', 'error')
    } finally {
      setBusy(false)
    }
  }
  return { requestBatchDelete, cancelBatchDelete, confirmBatchDelete }
}

/** Asking for, cancelling and confirming a bulk edit of the chosen rows. */
export function makeEditFlow(
  { actions, selected, setBusy, exitSelect, showToast }: FlowArgs,
  setPendingBulkEdit: Dispatch<SetStateAction<boolean>>,
  edit: EditRows,
) {
  const requestBulkEdit = () => {
    if (!actions || selected.size === 0) return
    setPendingBulkEdit(true)
  }

  const cancelBulkEdit = () => setPendingBulkEdit(false)

  const confirmBulkEdit = async (
    patch: BulkTransactionPatch,
    labelIdsToAdd: number[] = [],
  ) => {
    if (!actions || selected.size === 0) return
    setBusy(true)
    try {
      const { updated, asked } = await edit([...selected], patch, labelIdsToAdd, cancelBulkEdit)
      exitSelect()
      const toast =
        patch.description === undefined
          ? bulkOutcomeCopy('Updated', updated, asked)
          : bulkOutcomeCopy('Renamed', updated, asked, patch.description)
      showToast(toast, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update', 'error')
    } finally {
      setBusy(false)
    }
  }
  return { requestBulkEdit, cancelBulkEdit, confirmBulkEdit }
}
