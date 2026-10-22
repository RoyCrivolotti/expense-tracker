/**
 * The bulk writes that a request cannot hold in one piece, or that name their rows by a filter. A ledger read in
 * pages lists more rows than one request may name, so `withLedgerWrites` gives its source these in place of the
 * single-request ones, and the whole-dataset app, which never selects that many, does not carry them.
 */
import type { BulkTransactionPatch, ExpenseDataSource, MatchingTarget } from './dataSource'
import { req } from './apiClient'
import { apiLedgerParts } from './apiLedgerParts'
import { MAX_BULK_LABEL_LINKS } from '../domain/data/bulkEdit'
import { MAX_BULK_DELETE } from '../domain/data/transactionIds'
import type { Transaction } from '../domain/types'

const BULK = '/api/expenses/transactions/bulk'

/**
 * An edit by id writes every row and reads each one back: three statements a row in one request. The route takes
 * 500 ids, but nothing that large has been run on D1, so a request names at most this many until it has. An edit of
 * every row a filter matches is one request that costs about a statement for every twenty rows (12 for 266), so it
 * is preferred wherever it applies.
 */
const MAX_EDIT_IDS = 100

const send = <T>(method: string, url: string, body: unknown): Promise<T> =>
  req<T>(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const total = <T>(parts: T[], key: keyof T): number => parts.reduce((sum, part) => sum + (part[key] as number), 0)

/**
 * `ids` in requests of at most `size`, one after the other. A request that fails after others went through
 * says how far it got, because those stay written.
 */
async function inChunks<T>(ids: readonly number[], size: number, call: (chunk: number[]) => Promise<T>): Promise<T[]> {
  const parts: T[] = []
  for (let at = 0; at < ids.length; at += size) {
    try {
      parts.push(await call(ids.slice(at, at + size)))
    } catch (error) {
      if (at === 0) throw error
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`${at.toLocaleString('en-US')} of ${ids.length.toLocaleString('en-US')} were done before this failed: ${message}`, {
        cause: error,
      })
    }
  }
  return parts
}

export async function deleteTransactions(ids: number[]): Promise<{ deleted: number; requested: number }> {
  const parts = await inChunks(ids, MAX_BULK_DELETE, (chunk) =>
    send<{ deleted: number; requested: number }>('DELETE', BULK, { ids: chunk }),
  )
  return { deleted: total(parts, 'deleted'), requested: total(parts, 'requested') }
}

export async function updateTransactions(
  ids: number[],
  patch: BulkTransactionPatch,
): Promise<{ updated: number; transactions: Transaction[] }> {
  const parts = await inChunks(ids, MAX_EDIT_IDS, (chunk) =>
    send<{ updated: number; transactions: Transaction[] }>('PATCH', BULK, { ids: chunk, patch }),
  )
  return { updated: total(parts, 'updated'), transactions: parts.flatMap((part) => part.transactions) }
}

export async function addLabelsToTransactions(
  ids: number[],
  labelIds: number[],
): Promise<{ matched: number; added: number }> {
  // A request adds rows times labels links, and the server bounds that.
  const size = Math.max(1, Math.min(MAX_BULK_DELETE, Math.floor(MAX_BULK_LABEL_LINKS / labelIds.length)))
  const parts = await inChunks(ids, size, (chunk) =>
    send<{ matched: number; added: number }>('POST', `${BULK}/labels`, { ids: chunk, labelIds }),
  )
  return { matched: total(parts, 'matched'), added: total(parts, 'added') }
}

/**
 * The labels go first because adding them never changes which rows the filter matches, and an edit can. They
 * are a write, which moves the revision, so the summary is read again and the edit goes on only if it still
 * counts the rows that were shown; the count is checked by the server too, but a write from another tab in
 * the moment between the two requests, that leaves the count as it was, is not seen.
 */
export async function updateMatchingTransactions(
  target: MatchingTarget,
  patch: BulkTransactionPatch,
  labelIds: number[] = [],
): Promise<{ updated: number }> {
  const { filter, expectedCount } = target
  const edits = Object.keys(patch).length > 0
  let { expectedRevision } = target
  if (labelIds.length > 0) {
    await send('POST', `${BULK}/labels`, { filter, expectedCount, expectedRevision, labelIds })
    if (!edits) return { updated: expectedCount }
    const now = await apiLedgerParts.readTransactionSummary(filter)
    if (now.capped || now.count !== expectedCount) {
      throw new Error(
        `The labels were added, but ${now.capped ? 'more' : now.count} transactions match now, not the ${expectedCount} you were shown. Nothing else was changed; look again and retry`,
      )
    }
    expectedRevision = now.revision
  }
  return send<{ updated: number }>('PATCH', BULK, { filter, expectedCount, expectedRevision, patch })
}

export function withLedgerWrites<S extends ExpenseDataSource>(source: S): S {
  return { ...source, deleteTransactions, updateTransactions, addLabelsToTransactions, updateMatchingTransactions }
}
