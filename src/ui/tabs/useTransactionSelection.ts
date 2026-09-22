import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import type { BulkTransactionPatch } from '../../data/dataSource'
import type { ExpenseActions } from '../actions'
import { useToast } from '../hooks/useToast'
import { toggleDateSelection } from './selectionUtils'

/**
 * The chosen rows an action will leave alone because they are not on screen, said at
 * the moment of committing. The bar already counts them, but that is easy to miss, and
 * someone who chose eleven rows should not believe all eleven were changed.
 */
export function offScreenNote(hiddenCount: number, outcome: 'deleted' | 'changed'): string {
  if (hiddenCount <= 0) return ''
  const verb = hiddenCount === 1 ? "isn't" : "aren't"
  return `${hiddenCount} more you selected ${verb} shown and won't be ${outcome}.`
}

/**
 * A dialog or popover on screen owns Escape; the list behind it does not. One that is
 * `inert` is on its way out and answers nothing, so it does not count.
 */
function dialogIsOpen(): boolean {
  return [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].some(
    (el) => el.closest('[hidden], [inert]') === null,
  )
}

export function batchDeleteMessage(count: number, hiddenCount = 0): string {
  const noun = count === 1 ? 'transaction' : 'transactions'
  const note = offScreenNote(hiddenCount, 'deleted')
  return `${count} ${noun} will be removed permanently.${note ? ` ${note}` : ''}`
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

/**
 * The selection the user built, kept whole, and the part of it they can act on.
 *
 * `picked` survives a filter or month change, so narrowing a list and widening it again
 * gives the selection back. `selected` is `picked` limited to the rows on screen, and it
 * is what every count and every bulk action uses: a row hidden by a filter stays chosen
 * but cannot be deleted or edited from where the user cannot see it.
 *
 * Pass `visibleIds` and `existingIds` from the list; without them every picked row counts
 * as visible.
 */
export function useTransactionSelection(
  actions?: ExpenseActions,
  visibleIds?: readonly number[],
  existingIds?: readonly number[],
  onSelectModeChange?: (selecting: boolean) => void,
) {
  const { showToast } = useToast()
  const [selectMode, setSelectModeState] = useState(false)
  // Reported from the handlers that change it rather than mirrored in an effect, so the
  // shell hears about it in the same update.
  const setSelectMode = (selecting: boolean) => {
    setSelectModeState(selecting)
    onSelectModeChange?.(selecting)
  }
  // Leaving the tab mid-selection unmounts it without any handler running. Without this
  // the shell would keep the month locked on every other tab.
  const reportLeft = useEffectEvent(() => onSelectModeChange?.(false))
  useEffect(() => () => reportLeft(), [])
  const [picked, setPicked] = useState<Set<number>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [pendingBatchDelete, setPendingBatchDelete] = useState(false)
  const [pendingBulkEdit, setPendingBulkEdit] = useState(false)

  const selected = useMemo(() => {
    if (!visibleIds || picked.size === 0) return picked
    const visible = new Set(visibleIds)
    const onScreen = new Set<number>()
    for (const id of picked) if (visible.has(id)) onScreen.add(id)
    // Nothing hidden: hand back the same Set, so a render with no filter change does
    // not look like a selection change to anything memoised on it.
    return onScreen.size === picked.size ? picked : onScreen
  }, [picked, visibleIds])

  // A row deleted elsewhere is never on screen, so it never reaches `selected` and is
  // never acted on. It is only left out of this count, because no filter will bring it
  // back and "not shown" would promise otherwise. Derived rather than pruned from state,
  // which keeps every update driven by what the user did.
  const hiddenCount = useMemo(() => {
    if (!existingIds) return picked.size - selected.size
    const exists = new Set(existingIds)
    let stillThere = 0
    for (const id of picked) if (exists.has(id)) stillThere++
    return stillThere - selected.size
  }, [picked, selected, existingIds])

  const exitSelect = () => {
    setSelectMode(false)
    setPicked(new Set())
    setPendingBatchDelete(false)
    setPendingBulkEdit(false)
  }

  const toggleSelectMode = () => {
    // A bulk action can't be called back once sent, so leaving mid-request would only
    // look like it had been.
    if (busy) return
    if (selectMode) exitSelect()
    else setSelectMode(true)
  }

  const toggleSelected = (id: number) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleDate = (ids: number[]) => {
    setPicked((prev) => toggleDateSelection(prev, ids))
  }

  /** Adds every row on screen. A row already chosen behind a filter stays chosen. */
  const selectAll = (ids: number[]) => {
    setPicked((prev) => new Set([...prev, ...ids]))
  }

  /** Clears the lot, hidden rows included: "all" means all, and clearing is never destructive. */
  const deselectAll = () => {
    setPicked(new Set())
  }

  const enterAndSelect = (id: number) => {
    setSelectMode(true)
    setPicked(new Set([id]))
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

  const onEscape = useEffectEvent(() => {
    if (!busy) exitSelect()
  })
  useEffect(() => {
    if (!selectMode) return
    // Capture phase, so this looks before anything acts on the key. By the bubble phase
    // React has already closed and removed the dialog the Escape was for, and a layer from
    // another package (the hub menu) does not mark the key as used.
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !dialogIsOpen()) onEscape()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
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
    hiddenCount,
    enterAndSelect,
    requestBatchDelete,
    cancelBatchDelete,
    confirmBatchDelete,
    requestBulkEdit,
    cancelBulkEdit,
    confirmBulkEdit,
  }
}
