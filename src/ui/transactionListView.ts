import type { ReactNode } from 'react'
import type { MatchingTarget } from '../data/dataSource'
import type { TransactionPager } from '../data/transactionPager'
import type { TransactionListRow } from '../domain/engine/transactionListRows'
import type { TxnFilter } from '../domain/engine/transactions'
import type { Transaction } from '../domain/types'
import type { ExpenseActions } from './actions'
import type { useSelectionCore } from './tabs/useTransactionSelection'
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
  /** The rows the filter matches, as shown, when a write may name them by the filter: only a list read in pages has it. */
  matching?: MatchingTarget | null | undefined
  /** Drawn in place of the list when its first rows could not be read. */
  failed?: ReactNode
  /** Drawn under the list: what reads the next page. */
  footer?: ReactNode
}

export type ListHook = (model: ExpenseModel, filter: TxnFilter) => ListView

/** What a selection needs to know of the list it is over, beyond the ids on screen. */
export interface SelectionView {
  model: ExpenseModel
  list: ListView
  filter: TxnFilter
}

/**
 * What the select bar says differently when a list read in pages offers more than the rows it holds: the select button
 * (`matching` says whether it chooses every matching row or lets go of them), a note, and a delete that cannot be made.
 */
export interface BarOverrides {
  allLabel?: string
  matching?: boolean
  note?: string
  deleteBlocked?: boolean
}

export type Selection = ReturnType<typeof useSelectionCore> & {
  /** What the bar and the sheet count, when that is not the rows selected (every matching row was chosen). */
  selectedCount?: number
  /** Whether a rename can say which descriptions it replaces. */
  describable?: boolean
  bar?: BarOverrides
  /** Chooses every row the filter matches. */
  selectMatching?: () => void
}

export type SelectionHook = (
  actions: ExpenseActions | undefined,
  visibleIds: readonly number[],
  existingIds: readonly number[],
  onSelectModeChange: ((selecting: boolean) => void) | undefined,
  transactions: readonly Transaction[],
  view: SelectionView,
) => Selection

/** A list that is read in pages from the server instead of filtered from the rows the model holds. */
export interface PagedList {
  pager: TransactionPager
  useList: ListHook
  useSelection: SelectionHook
}
