import { useState } from 'react'
import type { ExpenseActions } from '../actions'
import { useToast } from '../hooks/useToast'
import { toggleDateSelection } from './selectionUtils'

export function batchDeleteMessage(count: number): string {
  const noun = count === 1 ? 'transaction' : 'transactions'
  return `${count} ${noun} will be removed permanently.`
}

export function useTransactionSelection(actions?: ExpenseActions) {
  const { showToast } = useToast()
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [pendingBatchDelete, setPendingBatchDelete] = useState(false)

  const exitSelect = () => {
    setSelectMode(false)
    setSelected(new Set())
    setPendingBatchDelete(false)
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
      await actions.deleteTransactions([...selected])
      exitSelect()
      showToast(`Deleted ${count} transaction${count === 1 ? '' : 's'}`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete', 'error')
    } finally {
      setBusy(false)
    }
  }

  return {
    selectMode,
    selected,
    busy,
    pendingBatchDelete,
    toggleSelectMode,
    toggleSelected,
    toggleDate,
    requestBatchDelete,
    cancelBatchDelete,
    confirmBatchDelete,
  }
}
