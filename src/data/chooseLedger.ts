import { type ExpenseDataSource, type LedgerPartsSource, hasLedgerParts } from './dataSource'
import { loadLedgerSnapshot } from './ledgerSnapshot'
import { startingFrom } from './priorReference'

export type LedgerSource = ExpenseDataSource & LedgerPartsSource

/** `'fallback'` is the whole-dataset app; anything else is the ledger, with the source that serves its parts. */
export type Chosen = 'fallback' | { ledger: LedgerSource }

/** Only a browser that says it is offline is: where there is no `navigator.onLine` to ask, the network is tried. */
const isOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false

/**
 * Whether to read this ledger in parts: not when the source cannot serve parts (an older server answers with
 * `PartsUnavailableError` on its first read), whatever the size of the ledger, which is held in full or as a window
 * as the hydration policy says. The reference read to find out is the one the session starts from, so the source it is
 * given answers its first read of the reference with that one, and the reference is read once. Offline, or when that
 * read fails, a snapshot of this owner's is enough to go on, whether it holds every row or a window.
 */
export async function chooseLedger(source: ExpenseDataSource, owner: string | undefined): Promise<Chosen> {
  if (!hasLedgerParts(source)) return 'fallback'
  const saved = async (): Promise<Chosen> => ((owner ? await loadLedgerSnapshot(owner) : null) ? { ledger: source } : 'fallback')
  if (!isOnline()) return saved()
  try {
    return { ledger: startingFrom(source, await source.readReferencePart()) }
  } catch {
    return saved()
  }
}
