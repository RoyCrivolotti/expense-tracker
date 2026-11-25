import { useMemo } from 'react'
import type { TransactionsEntry } from './transactionsEntry'
import type { ExpenseModel } from '../useExpenseData'
import { sumsOf } from '../modelSums'
import type { ExpenseActions } from '../actions'
import {
  buildTransactionListRows,
  computeCashReconciliation,
  filterTransactions,
  netSpendCents,
  type TxnFilter,
} from '../../engine'
import { useIsMobile } from '../hooks/useIsMobile'
import type { ListView, SelectionHook } from '../transactionListView'
import { useTxnListFilters } from './useTxnListFilters'
import { useTransactionSelection } from './useTransactionSelection'

/** The list when the model holds every row it can show: filtered here, in one go. */
export function listOfHeldRows(
  model: ExpenseModel,
  sums: ExpenseModel['dataset'],
  filter: TxnFilter,
): ListView {
  const { dataset } = model
  const results = filterTransactions(dataset.transactions, filter)
  const cashRows = computeCashReconciliation(sums.transactions, dataset.accounts, dataset.settings, dataset.cashActuals)
  const listRows = buildTransactionListRows(
    dataset.transactions,
    filter,
    dataset.accountStatements,
    cashRows,
    dataset.accounts,
    dataset.settings,
  )
  return { results, listRows, totalCents: netSpendCents(results), count: listRows.length }
}

function useHeldList(
  model: ExpenseModel,
  filter: TxnFilter,
): ListView {
  const sums = sumsOf(model)
  return useMemo(() => listOfHeldRows(model, sums, filter), [model.dataset, sums, filter]) // eslint-disable-line react-hooks/exhaustive-deps -- the model's dataset and sums are the inputs
}

/** What the app shell tells the tab about things that happen outside it. */
export interface TransactionsShell {
  /** Told when row selection starts and ends, so the shell can hold the month still. */
  onSelectModeChange?: ((selecting: boolean) => void) | undefined
  /** How many times the user has moved the header month. */
  monthNavigation?: number | undefined
  /** A filter preset another tab handed over on the way in (see transactionsEntry). */
  entry?: TransactionsEntry | null | undefined
}

export function useTransactionsTabState(
  model: ExpenseModel,
  month: string,
  actions?: ExpenseActions,
  shell: TransactionsShell = {},
) {
  const filters = useTxnListFilters(
    month,
    model.dataset.flags,
    model.dataset.labels,
    shell.monthNavigation ?? 0,
    shell.entry,
  )
  const isMobile = useIsMobile()

  // A model whose list is read in pages brings its own hook; its presence does not change while it lives.
  const useList = model.pagedList?.useList ?? useHeldList
  const list = useList(model, filters.filter)

  const visibleIds = useMemo(
    () => list.listRows.flatMap((r) => (r.kind === 'transaction' ? [r.txn.id] : [])),
    [list.listRows],
  )

  const existingIds = useMemo(() => model.dataset.transactions.map((t) => t.id), [model.dataset.transactions])

  // This tab does not remount on a filter or month change, so the selection is told what
  // is on screen rather than rebuilt: it keeps rows a filter hides and acts only on the rest.
  const useSelection: SelectionHook = model.pagedList?.useSelection ?? useTransactionSelection
  const selection = useSelection(
    actions,
    visibleIds,
    existingIds,
    shell.onSelectModeChange,
    model.dataset.transactions,
    {
      model,
      list,
      filter: filters.filter,
    },
  )

  return {
    ...filters,
    isMobile,
    ...list,
    visibleIds,
    canDelete: Boolean(actions?.deleteTransaction),
    ...selection,
  }
}
