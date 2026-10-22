import { useMemo, useState } from 'react'
import type { MatchingTarget } from '../data/dataSource'
import type { ExpenseActions } from './actions'
import { type EditRows, useSelectionCore } from './tabs/useTransactionSelection'
import type { BarOverrides, SelectionHook } from './transactionListView'

/** Every row the list holds is chosen, and more match: the next step is all of them. */
function canChoose(partial: boolean | undefined, offer: MatchingTarget | null, loaded: number, chosen: number): boolean {
  return partial === true && offer !== null && loaded > 0 && chosen >= loaded && offer.expectedCount > loaded
}

/** What the select bar says: the way on to every matching row, or the note that they can be edited only. */
function barOf(chosenEvery: boolean, canChoose: boolean, count: number | undefined): BarOverrides | undefined {
  if (chosenEvery) return { allLabel: 'Deselect all', matching: false, note: 'edit only', deleteBlocked: true }
  return canChoose ? { allLabel: `Select all ${count}`, matching: true } : undefined
}

/**
 * How the rows chosen are edited: through the filter when they are every row it matches (chosen so, or one by one),
 * otherwise by id with their labels added through the bulk route.
 */
function editVia(
  actions: ExpenseActions | undefined,
  chosen: MatchingTarget | null,
  offer: MatchingTarget | null,
  letGo: () => void,
): EditRows {
  return async (ids, patch, labelIds, closeSheet) => {
    const every = chosen ?? (offer && ids.length === offer.expectedCount ? offer : null)
    try {
      if (every) return { updated: await actions!.updateMatching!(every, patch, labelIds), asked: every.expectedCount }
      const updated = Object.keys(patch).length > 0 ? await actions!.updateTransactions(ids, patch) : ids.length
      if (labelIds.length > 0) await actions!.addLabels!(ids, labelIds)
      return { updated, asked: ids.length }
    } catch (error) {
      // The count they were shown is not to be trusted after a refusal: the list reads it again, and they choose again.
      // The sheet closes with it, since pressing Apply there would edit the rows on screen and not the ones it named.
      if (every) {
        letGo()
        closeSheet()
      }
      throw error
    }
  }
}

/**
 * The selection over a list read in pages, which lists more rows than it holds.
 *
 * - A chosen row the list no longer shows is counted as not shown: the list cannot tell a row it has not read from one
 *   deleted elsewhere. A list the model holds in full can, and says which rows exist.
 * - Once every row the list holds is chosen and more match, the select button goes on to "Select all N": the filter,
 *   with the count and revision the user was shown, kept as they were because the server refuses the edit if either
 *   has moved. It ends when the filter changes or a row is picked or cleared. It can be edited but not deleted, since a
 *   delete names its ids, and a rename cannot say what it replaces, since only the rows on screen are known.
 * - The rows are edited through that filter whenever they are exactly the rows it matches, however they were chosen: it
 *   is one request that costs about a twentieth of the statements, and cannot miss a row. Otherwise they are edited by
 *   id, and their labels added through the bulk route, which keeps the labels a row has (the rows are not all held, so
 *   their labels cannot be looked up here).
 */
export const usePagedSelection: SelectionHook = (
  actions,
  visibleIds,
  _existingIds,
  onSelectModeChange,
  _transactions,
  { model, list, filter },
) => {
  const [chosen, setChosen] = useState<{ target: MatchingTarget; filterKey: string } | null>(null)
  const filterKey = JSON.stringify(filter)
  const target = chosen?.filterKey === filterKey ? chosen.target : null
  const offer = list.matching ?? null
  const existingIds = useMemo(
    () => (model.sums === undefined ? model.dataset.transactions.map((t) => t.id) : undefined),
    [model.dataset.transactions, model.sums],
  )

  const edit = editVia(actions, target, offer, () => setChosen(null))
  const core = useSelectionCore({ actions, visibleIds, existingIds, onSelectModeChange, edit })

  const clearing = <A extends unknown[]>(act: (...args: A) => void) => (...args: A) => {
    setChosen(null)
    act(...args)
  }
  const bar = barOf(target !== null, canChoose(list.partial, offer, visibleIds.length, core.selected.size), offer?.expectedCount)

  return {
    ...core,
    toggleSelectMode: () => {
      if (!core.selectMode) setChosen(null)
      core.toggleSelectMode()
    },
    toggleSelected: clearing(core.toggleSelected),
    toggleDate: clearing(core.toggleDate),
    selectAll: clearing(core.selectAll),
    deselectAll: clearing(core.deselectAll),
    enterAndSelect: clearing(core.enterAndSelect),
    requestBatchDelete: () => {
      if (!target) core.requestBatchDelete()
    },
    selectMatching: () => {
      if (offer) setChosen({ target: offer, filterKey })
      core.selectAll(visibleIds)
    },
    hiddenCount: target ? 0 : core.hiddenCount,
    selectedCount: target ? target.expectedCount : core.selected.size,
    describable: target === null,
    ...(bar ? { bar } : {}),
  }
}
