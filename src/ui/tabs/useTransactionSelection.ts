import { useCallback, useEffect, useState } from 'react'
import type { BulkTransactionPatch } from '../../data/dataSource'
import type { ExpenseActions } from '../actions'
import { useToast } from '../hooks/useToast'
import { toggleDateSelection } from './selectionUtils'

export function batchDeleteMessage(count: number): string {
  const noun = count === 1 ? 'transaction' : 'transactions'
  return `${count} ${noun} will be removed permanently.`
}

/**
 * Rows can vanish between selecting them and confirming — another device, another tab,
 * a cascade from a deleted plan. Reporting the count that was asked for rather than the
 * one the server touched hides exactly that.
 */
export function bulkOutcomeCopy(
  verb: 'Deleted' | 'Updated',
  done: number,
  requested: number,
): string {
  if (done < requested) return `${verb} ${done} of ${requested} transactions`
  return `${verb} ${done} transaction${done === 1 ? '' : 's'}`
}

export function useTransactionSelection(actions?: ExpenseActions) {
  const { showToast } = useToast()
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [pendingBatchDelete, setPendingBatchDelete] = useState(false)
  const [pendingBulkEdit, setPendingBulkEdit] = useState(false)

  const exitSelect = () => {
    setSelectMode(false)
    setSelected(new Set())
    setPendingBatchDelete(false)
    setPendingBulkEdit(false)
  }

  const toggleSelectMode = () => {
    if (selectMode) exitSelect()
    else setSelectMode(true)
  }

  const toggleSelected = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleDate = (ids: number[]) => {
    setSelected((prev) => toggleDateSelection(prev, ids))
  }

  const selectAll = (ids: number[]) => {
    setSelected(new Set(ids))
  }

  const deselectAll = () => {
    setSelected(new Set())
  }

  /**
   * Drop anything no longer on screen, so a bulk action cannot reach rows the user
   * cannot see. Retains rather than clears, so refining a filter keeps the rest of the
   * selection. `useCallback` because an effect depends on its identity.
   */
  const retainOnly = useCallback((ids: number[]) => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const visible = new Set(ids)
      const next = new Set<number>()
      for (const id of prev) if (visible.has(id)) next.add(id)
      // Same contents: return the old Set so dependent effects do not re-run.
      return next.size === prev.size ? prev : next
    })
  }, [])

  const enterAndSelect = (id: number) => {
    setSelectMode(true)
    setSelected(new Set([id]))
  }

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

  const requestBulkEdit = () => {
    if (!actions || selected.size === 0) return
    setPendingBulkEdit(true)
  }

  const cancelBulkEdit = () => setPendingBulkEdit(false)

  const confirmBulkEdit = async (patch: BulkTransactionPatch) => {
    if (!actions || selected.size === 0) return
    const count = selected.size
    setBusy(true)
    try {
      const updated = await actions.updateTransactions([...selected], patch)
      exitSelect()
      showToast(bulkOutcomeCopy('Updated', updated, count), 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update', 'error')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!selectMode) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitSelect()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectMode])

  return {
    selectMode,
    selected,
    busy,
    pendingBatchDelete,
    pendingBulkEdit,
    toggleSelectMode,
    toggleSelected,
    toggleDate,
    selectAll,
    deselectAll,
    retainOnly,
    enterAndSelect,
    requestBatchDelete,
    cancelBatchDelete,
    confirmBatchDelete,
    requestBulkEdit,
    cancelBulkEdit,
    confirmBulkEdit,
  }
}
