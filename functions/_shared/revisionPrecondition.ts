import { BULK_REVISION_MESSAGE } from '../domain/data/bulkEdit'
import type { ExpensesData } from './env'
import { HttpError } from './http'

/**
 * Refuses a write that was based on an older view of the ledger. `expected` is the revision the user's
 * view was read at (the `revision` of the summary or of a ledger part); the middleware has already
 * replaced the token by the time a handler runs, so the one to compare with is the token it replaced.
 * Any write since the view moves the token, including one from another tab.
 */
export function assertRevisionUnchanged(data: ExpensesData, expected: string): void {
  if (data.revisionBeforeWrite !== expected) throw new HttpError(409, BULK_REVISION_MESSAGE)
}
