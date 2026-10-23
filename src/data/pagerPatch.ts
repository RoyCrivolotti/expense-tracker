import { byApiOrder } from '../domain/ledger'
import { filterTransactions, type TxnFilter } from '../domain/engine/transactions'
import type { Transaction } from '../domain/types'

/** What a write did to rows, by id: those that are new or changed as they are now, and the ids that are gone. */
export interface RowChanges {
  upserted: readonly Transaction[]
  removed: readonly number[]
}

/** The rows that differ between two lists of them, by id. A row the patch left as it was (the same object) is not one. */
export function rowChangesOf(before: readonly Transaction[], after: readonly Transaction[]): RowChanges {
  const was = new Map(before.map((row) => [row.id, row]))
  const now = new Set(after.map((row) => row.id))
  return {
    upserted: after.filter((row) => was.get(row.id) !== row),
    removed: before.filter((row) => !now.has(row.id)).map((row) => row.id),
  }
}

/**
 * The rows of a list read in pages, with what a write did to them put in at once, so that a screen does not show
 * the list as it was until the read that follows. A row that is gone goes; a row held goes if the edit took it out of
 * the filter, and is replaced otherwise; a new row is added if the filter matches it and it comes before the end of
 * what was read (anywhere, once the list is complete), because a row behind the cursor is on a page not read yet. This
 * is a guess at what the server will say, and the read that follows is what is true: it replaces all of this. The same
 * array comes back when nothing changed.
 */
export function patchedRows(
  rows: readonly Transaction[],
  filter: TxnFilter,
  complete: boolean,
  { upserted, removed }: RowChanges,
): readonly Transaction[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  let changed = false
  for (const id of removed) changed = byId.delete(id) || changed
  const last = rows[rows.length - 1]
  for (const row of upserted) {
    const held = byId.has(row.id)
    const matches = filterTransactions([row], filter).length > 0
    const within = complete || (last !== undefined && byApiOrder(row, last) <= 0)
    if (matches && (held || within)) byId.set(row.id, row)
    else if (!held) continue
    else byId.delete(row.id)
    changed = true
  }
  return changed ? [...byId.values()].sort(byApiOrder) : rows
}
