import type { TxnFilter } from '../domain/engine/transactions'
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
