import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { PagerState, TransactionPager } from '../data/transactionPager'
import { computeCashReconciliation } from '../domain/engine/cashReconciliation'
import { filteredStatementPayments, pagedListRows } from '../domain/engine/pagedListRows'
import { netSpendCents, type TxnFilter } from '../domain/engine/transactions'
import { useConnectivityState } from './hooks/useConnectivityState'
import { sumsOf } from './modelSums'
import { usePagedSelection } from './pagedSelection'
import { ListFailed, PagedListFooter } from './PagedListFooter'
import { listOfHeldRows } from './tabs/useTransactionsTabState'
import type { ListView, PagedList } from './transactionListView'
import type { ExpenseModel } from './useExpenseData'

type Figures = Pick<ListView, 'count' | 'capped' | 'totalCents' | 'totalsStale'>

/**
 * What the header says. A list that has been read to its end adds up exactly, whatever the summary says. Before
 * that the summary's figures stand, and a count that stopped is a bound. Figures read for the filter before this
 * one stay, marked, until the new ones come; with none at all the count is what has been read so far, as a bound,
 * and there is no net spend to give.
 */
function figuresOf({ rows, complete, stale, summary, summaryStale }: PagerState, payments: number): Figures {
  const own = complete && !stale
  const held = rows as ListView['results']
  return {
    count: own || !summary ? rows.length + payments : summary.count + (summary.capped ? 0 : payments),
    capped: !own && (summary ? summary.capped : true),
    totalCents: own ? netSpendCents(held) : summary ? summary.netSpendCents : null,
    totalsStale: !own && (stale || (summary !== null && summaryStale)),
  }
}

function usePagedRows(pager: TransactionPager, model: ExpenseModel, filter: TxnFilter): ListView {
  const { readOnly } = useConnectivityState()
  const { dataset } = model
  const sums = sumsOf(model)
  // A write made while this tab is not showing costs no read: the first screen to attach reads the list again.
  useEffect(() => pager.attach(), [pager])
  useEffect(() => {
    if (!readOnly) pager.setFilter(filter)
  }, [pager, filter, readOnly])
  const state = useSyncExternalStore(pager.subscribe, pager.getState)
  const { rows, complete, error, stale, loading } = state
  const payments = useMemo(() => {
    const cashRows = computeCashReconciliation(sums.transactions, dataset.accounts, dataset.settings, dataset.cashActuals)
    return filteredStatementPayments(dataset.accountStatements, cashRows, dataset.accounts, dataset.settings, filter)
  }, [dataset.accountStatements, dataset.accounts, dataset.settings, dataset.cashActuals, sums, filter])
  const listRows = useMemo(() => pagedListRows(rows, payments, complete), [rows, payments, complete])
  const footer = useMemo(() => <PagedListFooter pager={pager} />, [pager])
  // Read from the pager whenever it changes: the figures it was taken from are the ones in `state`.
  const matching = useMemo(() => pager.matching(), [pager, state]) // eslint-disable-line react-hooks/exhaustive-deps -- `state` is what changes it
  // Offline there are no pages to read, but a ledger held in full is still there to filter.
  const held = useMemo(() => (readOnly ? listOfHeldRows(model, sums, filter) : null), [readOnly, model, sums, filter])
  if (held) return held
  // A first page that failed has no rows to show, and saying so is not the same as saying nothing matches.
  const failed = error !== null && rows.length === 0 && !loading ? <ListFailed onRetry={() => pager.loadMore()} /> : undefined
  return {
    results: rows as ListView['results'],
    listRows,
    ...figuresOf(state, payments.length),
    // Nothing is known until the first page has come, or has failed.
    loading: rows.length === 0 && !complete && error === null,
    stale,
    partial: !complete,
    failed,
    footer,
    matching,
  }
}

/** The pager as the Transactions tab takes it: its filter set from the screen's, its rows and count read back. */
export function pagedListOf(pager: TransactionPager): PagedList {
  return { pager, useList: (model, filter) => usePagedRows(pager, model, filter), useSelection: usePagedSelection }
}
