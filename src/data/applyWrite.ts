import type { ExpenseDataset } from '../domain/types'
import type { LedgerSession, WriteReach } from './ledgerSession'
import type { TransactionPager } from './transactionPager'

/**
 * A write the user made, shown in what the session holds and in the list read in pages. A list read from the server
 * does not see a write until it is read again, so it is read again whenever the write changed rows, which the session
 * answers (`patch`). A plan's instalments are inserted by the server when the ledger is read, so the list is read
 * after that read has finished, and not beside it.
 *
 * Resolves with whether that read worked: null when the write needed none or no screen shows the list to read, true
 * when it worked, false when it failed and the list on screen is still the list before the write.
 */
export async function applyWrite(
  session: LedgerSession,
  pager: TransactionPager,
  patch: (dataset: ExpenseDataset) => ExpenseDataset,
  reach?: WriteReach,
): Promise<boolean | null> {
  if (!session.patch(patch, reach)) return null
  await session.afterPlanWrite()
  return pager.refresh({ summary: true })
}
