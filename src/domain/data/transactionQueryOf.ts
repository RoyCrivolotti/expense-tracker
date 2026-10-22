import { filterTransactions, netSpendCents, type TxnFilter } from '../engine/transactions'
import type { Transaction } from '../types'
import {
  SUMMARY_COUNT_CAP,
  type TransactionPage,
  type TransactionPageRequest,
  type TransactionSummary,
} from './transactionQuery'

/**
 * The reference the SQL path is held to, and what a source that holds the whole dataset answers with: the
 * engine's own filter and sort, cut at a position. A position is a place in the order, not an offset, so a
 * row that comes or goes between two calls moves nothing that was already read.
 */
const withAscendingLabels = (t: Transaction): Transaction => ({
  ...t,
  labelIds: [...(t.labelIds ?? [])].sort((a, b) => a - b),
})

export function pageOf(
  all: Transaction[],
  filter: TxnFilter,
  { limit, after }: TransactionPageRequest,
): TransactionPage {
  const ordered = filterTransactions(all, filter)
  const rest = after
    ? ordered.filter((t) => t.date < after.date || (t.date === after.date && t.id < after.id))
    : ordered
  return { items: rest.slice(0, limit).map(withAscendingLabels), hasMore: rest.length > limit }
}

export function oneOf(all: Transaction[], id: number): Transaction | null {
  const found = all.find((t) => t.id === id)
  return found ? withAscendingLabels(found) : null
}

export function summaryOf(all: Transaction[], filter: TxnFilter): TransactionSummary {
  const matching = filterTransactions(all, filter)
  return {
    count: Math.min(matching.length, SUMMARY_COUNT_CAP),
    capped: matching.length > SUMMARY_COUNT_CAP,
    netSpendCents: netSpendCents(matching),
  }
}
