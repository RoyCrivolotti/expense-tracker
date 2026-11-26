import { useState } from 'react'
import type { BulkTransactionPatch } from '../../data/dataSource'
import type { Transaction } from '../../types'
import type { ExpenseActions } from '../actions'
import { useToast } from '../hooks/useToast'
import { toggleDateSelection } from './selectionUtils'
import { makeDeleteFlow, makeEditFlow } from './selectionFlows'
import { useEscapeToExit, useSelectMode, useVisiblePicked } from './selectionHooks'

/**
 * Edits the rows chosen: the fields, then the labels to add. Resolves with how many rows changed and how many were
 * asked for, which the toast says. `closeSheet` is for an edit that has to be asked for again from the start.
 */
export type EditRows = (
  ids: number[],
  patch: BulkTransactionPatch,
  labelIds: number[],
  closeSheet: () => void,
) => Promise<{ updated: number; asked: number }>

export interface SelectionOptions {
  actions?: ExpenseActions | undefined
  visibleIds?: readonly number[] | undefined
  existingIds?: readonly number[] | undefined
  onSelectModeChange?: ((selecting: boolean) => void) | undefined
  edit: EditRows
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
 * as visible. `existingIds` is for a list that holds every row there is: one that does not
 * cannot tell a row it has not read from a row that was deleted elsewhere, so it leaves
 * `existingIds` out and a chosen row it no longer shows counts as hidden.
 *
 * How the chosen rows are edited is `edit`: a list that holds every row does it here
 * (`useTransactionSelection`), and one read in pages does it as `pagedSelection.ts` says.
 */
export function useSelectionCore({ actions, visibleIds, existingIds, onSelectModeChange, edit }: SelectionOptions) {
  const { showToast } = useToast()
  const { selectMode, setSelectMode } = useSelectMode(onSelectModeChange)
  const [picked, setPicked] = useState<Set<number>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [pendingBatchDelete, setPendingBatchDelete] = useState(false)
  const [pendingBulkEdit, setPendingBulkEdit] = useState(false)

  const { selected, hiddenCount } = useVisiblePicked(picked, visibleIds, existingIds)

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

  const toggleDate = (ids: number[]) => setPicked((prev) => toggleDateSelection(prev, ids))

  /** Adds every row on screen. A row already chosen behind a filter stays chosen. */
  const selectAll = (ids: readonly number[]) => {
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

  const flow = { actions, selected, setBusy, exitSelect, showToast }
  const deleteFlow = makeDeleteFlow(flow, setPendingBatchDelete)
  const editFlow = makeEditFlow(flow, setPendingBulkEdit, edit)

  useEscapeToExit(selectMode, busy, exitSelect)

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
    ...deleteFlow,
    ...editFlow,
  }
}

/**
 * The selection over a list the model holds in full, where the rows chosen are all held: they are edited as a
 * group, and each keeps the labels it has while the chosen ones are added.
 *
 * Labels are additive here, unlike every other bulk field: the rows in one
 * bulk edit can each already carry a different set, and a label is only ever
 * removed by hand everywhere else in the app (see bulkEditFields.ts). Each
 * selected row keeps whatever it already has, plus whatever was picked.
 *
 * One request per row, since a transaction's labels are replaced one at a time
 * (setTransactionLabels). If any of them fails this throws like the patch, landing in
 * the same catch: a partial label application with no count attached would be a worse
 * outcome than one "could not update" toast covering both.
 */
export function useTransactionSelection(
  actions?: ExpenseActions,
  visibleIds?: readonly number[],
  existingIds?: readonly number[],
  onSelectModeChange?: (selecting: boolean) => void,
  /** Looked up by id to union onto each row's own labels. */
  transactions?: readonly Pick<Transaction, 'id' | 'labelIds'>[],
) {
  const edit: EditRows = async (
    ids,
    patch,
    labelIdsToAdd,
  ) => {
    // A patch with nothing in it is rejected server-side as an empty edit — a
    // labels-only bulk edit has no column to set, so this is skipped rather
    // than sent.
    const updated = Object.keys(patch).length > 0 ? await actions!.updateTransactions(ids, patch) : ids.length
    if (labelIdsToAdd.length > 0) {
      const byId = new Map((transactions ?? []).map((t) => [t.id, t.labelIds]))
      await Promise.all(
        ids.map((id) => {
          const next = [...new Set([...(byId.get(id) ?? []), ...labelIdsToAdd])]
          return actions!.setTransactionLabels(id, next)
        }),
      )
    }
    return { updated, asked: ids.length }
  }
  return useSelectionCore({ actions, visibleIds, existingIds, onSelectModeChange, edit })
}
