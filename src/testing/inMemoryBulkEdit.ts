import {
  MAX_FILTER_EDIT_ROWS,
  bulkCountMessage,
  bulkTooManyMessage,
  type FilterTarget,
} from '../domain/data/bulkEdit'
import { filterTransactions } from '../domain/engine/transactions'
import type { Transaction } from '../domain/types'
import { RepoHttpError } from './repoHttpError'

/**
 * The rows a bulk write on a filter reaches, by the engine's own filter and with the refusals of the SQL
 * path: more matches than the cap is a 400, a count other than the one the user was shown is a 409.
 */
export function idsMatching(all: Transaction[], { filter, expectedCount }: FilterTarget): number[] {
  const ids = filterTransactions(all, filter).map((t) => t.id)
  if (ids.length > MAX_FILTER_EDIT_ROWS) throw new RepoHttpError(400, bulkTooManyMessage())
  if (ids.length !== expectedCount) throw new RepoHttpError(409, bulkCountMessage(ids.length, expectedCount))
  return ids
}
