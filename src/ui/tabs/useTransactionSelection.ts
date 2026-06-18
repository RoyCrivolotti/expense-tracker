import { useState } from 'react'
import type { ExpenseActions } from '../actions'
import { confirmDeleteMany } from '../components/confirmDelete'
import { toggleDateSelection } from './selectionUtils'

export function useTransactionSelection(actions?: ExpenseActions) {
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [busy, setBusy] = useState(false)

  const exitSelect = () => {
    setSelectMode(false)
    setSelected(new Set())
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

  const deleteSelected = async () => {
    if (!actions || selected.size === 0 || !confirmDeleteMany(selected.size)) return
    setBusy(true)
    try {
      await actions.deleteTransactions([...selected])
      exitSelect()
    } finally {
      setBusy(false)
    }
  }

  return {
    selectMode,
    selected,
    busy,
    toggleSelectMode,
    toggleSelected,
    toggleDate,
    deleteSelected,
  }
}
