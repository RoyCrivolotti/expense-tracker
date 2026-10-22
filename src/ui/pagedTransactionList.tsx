import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { TransactionPager } from '../data/transactionPager'
import { computeCashReconciliation } from '../domain/engine/cashReconciliation'
import { filteredStatementPayments, pagedListRows } from '../domain/engine/pagedListRows'
import { netSpendCents, type TxnFilter } from '../domain/engine/transactions'
import { useConnectivityState } from './hooks/useConnectivityState'
import { sumsOf } from './modelSums'
import { PagedListFooter } from './PagedListFooter'
import { listOfHeldRows } from './tabs/useTransactionsTabState'
import type { ListView, PagedList } from './transactionListView'
import type { ExpenseModel } from './useExpenseData'

function usePagedRows(pager: TransactionPager, model: ExpenseModel, filter: TxnFilter): ListView {
  const { readOnly } = useConnectivityState()
  const { dataset } = model
  const sums = sumsOf(model)
  useEffect(() => {
    if (!readOnly) pager.setFilter(filter)
  }, [pager, filter, readOnly])
  const { rows, complete, error, summary } = useSyncExternalStore(pager.subscribe, pager.getState)
  const payments = useMemo(() => {
    const cashRows = computeCashReconciliation(sums.transactions, dataset.accounts, dataset.settings, dataset.cashActuals)
    return filteredStatementPayments(dataset.accountStatements, cashRows, dataset.accounts, dataset.settings, filter)
  }, [dataset.accountStatements, dataset.accounts, dataset.settings, dataset.cashActuals, sums, filter])
  const listRows = useMemo(() => pagedListRows(rows, payments, complete), [rows, payments, complete])
  const footer = useMemo(() => <PagedListFooter pager={pager} />, [pager])
  // Offline there are no pages to read, but a ledger held in full is still there to filter.
  const held = useMemo(() => (readOnly ? listOfHeldRows(model, sums, filter) : null), [readOnly, model, sums, filter])
  if (held) return held
  const capped = summary ? summary.capped : !complete
  // A summary counts the transactions only: the statement payments the filter lets through are added to it, unless
  // it stopped counting, when the figure is a bound anyway.
  const count = summary ? summary.count + (summary.capped ? 0 : payments.length) : rows.length + payments.length
  return {
    results: rows as ListView['results'],
    listRows,
    totalCents: summary ? summary.netSpendCents : netSpendCents(rows as ListView['results']),
    count,
    capped,
    // Nothing is known until the first page has come, or has failed, which the footer says.
    loading: rows.length === 0 && !complete && error === null,
    footer,
  }
}

/** The pager as the Transactions tab takes it: its filter set from the screen's, its rows and count read back. */
export function pagedListOf(pager: TransactionPager): PagedList {
  return { pager, useList: (model, filter) => usePagedRows(pager, model, filter) }
}
