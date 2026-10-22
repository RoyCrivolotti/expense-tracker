import type { ReactNode } from 'react'
import type { TransactionPager } from '../data/transactionPager'
import type { TransactionListRow } from '../domain/engine/transactionListRows'
import type { TxnFilter } from '../domain/engine/transactions'
import type { Transaction } from '../domain/types'
import type { ExpenseModel } from './useExpenseData'

/** What the Transactions tab lists for a filter, however the rows came to be here. */
export interface ListView {
  /** The transactions the list holds, newest first. */
  results: Transaction[]
  /** The rows to draw: those, with the statement payments among them. */
  listRows: TransactionListRow[]
  /** Net spend of the rows the filter matches, or null while it is not known: the first figures are on their way. */
  totalCents: number | null
  /** How many rows match; a lower bound when `capped`. */
  count: number
  capped?: boolean | undefined
  /** The first rows are on their way. */
  loading?: boolean | undefined
  /** The rows belong to the filter before this one and are shown until the new ones come. */
  stale?: boolean | undefined
  /** The count and net spend belong to the filter before this one, or may no longer fit. */
  totalsStale?: boolean | undefined
  /** More rows match than the list holds, so the rows it holds are not all there are. */
  partial?: boolean | undefined
  /** Drawn in place of the list when its first rows could not be read. */
  failed?: ReactNode
  /** Drawn under the list: what reads the next page. */
  footer?: ReactNode
}

export type ListHook = (model: ExpenseModel, filter: TxnFilter) => ListView

/** A list that is read in pages from the server instead of filtered from the rows the model holds. */
export interface PagedList {
  pager: TransactionPager
  useList: ListHook
}
