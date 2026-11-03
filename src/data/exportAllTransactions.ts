import type { Transaction } from '../domain/types'
import type { LedgerPartsSource } from './dataSource'
import { byApiOrder } from './ledgerReconcile'

/** A walk that finds the ledger changed is started again this many times before it gives up. */
const ATTEMPTS = 3

/** Every chunk in turn, or null when one of them was read under another revision than the first. */
async function walk(source: Pick<LedgerPartsSource, 'readTransactionExport'>, signal: AbortSignal | undefined): Promise<Transaction[] | null> {
  const rows: Transaction[] = []
  let revision: string | undefined
  let after: string | undefined
  for (;;) {
    const chunk = await source.readTransactionExport({ ...(after !== undefined ? { after } : {}), ...(signal ? { signal } : {}) })
    if (revision !== undefined && chunk.revision !== revision) return null
    revision = chunk.revision
    for (const row of chunk.rows) rows.push(row)
    if (chunk.next === null) return rows
    after = chunk.next
  }
}

/**
 * Every transaction of the ledger, newest first, read a chunk at a time from the server, for a file that must hold
 * all of them when the browser holds only a window, in the order a dataset lists them (so the file is the one a classic
 * export writes). The server's walk is not a snapshot, so a write made in between
 * (from another tab) starts it again rather than hand back a file that mixes two states.
 */
export async function exportAllTransactions(
  source: Pick<LedgerPartsSource, 'readTransactionExport'>,
  signal?: AbortSignal,
): Promise<Transaction[]> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const rows = await walk(source, signal)
    if (rows !== null) return rows.sort(byApiOrder)
  }
  throw new Error('The ledger kept changing while it was being read. Try again.')
}
