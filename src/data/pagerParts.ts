import type { TxnFilter } from '../domain/engine/transactions'
import { MAX_PAGE_LIMIT } from '../domain/data/transactionQuery'
import type { Transaction } from '../domain/types'
import type { PagerState } from './transactionPager'

/** A pager before anything was read: no rows, nothing loading, no figures. */
export const START: PagerState = {
  rows: [],
  complete: false,
  loading: false,
  refreshing: false,
  stale: false,
  error: null,
  refreshFailed: false,
  summary: null,
  summaryStale: false,
}

/** A copy of the filter the caller cannot change under a cursor that was cut from it. */
export function frozen(filter: TxnFilter): TxnFilter {
  return Object.freeze({
    ...filter,
    ...(filter.labelIds ? { labelIds: Object.freeze([...filter.labelIds]) as number[] } : {}),
    ...(filter.queryAmount ? { queryAmount: Object.freeze({ ...filter.queryAmount }) } : {}),
  })
}

/** How many rows to ask for: as many as a read to `depth` still lacks (up to what the server allows), or `pageSize` for a first page. */
export function pageLimit(
  depth: number,
  have: number,
  pageSize: number,
): number {
  return depth > 0 ? Math.min(MAX_PAGE_LIMIT, depth - have) : pageSize
}

/** The rows held that the page does not send again: the later copy of a row replaces the one already held. */
export function withoutRowsOf(
  held: readonly Transaction[],
  page: readonly Transaction[],
): Transaction[] {
  const fresh = new Set(page.map((row) => row.id))
  return held.filter((row) => !fresh.has(row.id))
}
