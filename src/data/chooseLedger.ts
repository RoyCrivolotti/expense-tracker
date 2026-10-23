import { type ExpenseDataSource, type LedgerPartsSource, hasLedgerParts } from './dataSource'
import { loadLedgerSnapshot } from './ledgerSnapshot'
import { startingFrom } from './priorReference'
import { FULL_HYDRATION_ROW_LIMIT } from '../domain/ledger'

export type LedgerSource = ExpenseDataSource & LedgerPartsSource

/** `'fallback'` is the whole-dataset app; anything else is the ledger, with the source that serves its parts. */
export type Chosen = 'fallback' | { ledger: LedgerSource }

/** Only a browser that says it is offline is: where there is no `navigator.onLine` to ask, the network is tried. */
const isOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false

/**
 * Whether to read this ledger in parts. Not when the source cannot serve parts (an older server answers
 * with `PartsUnavailableError` on its first read), and not when the ledger is too large to hold in full:
 * the screens of a ledger that holds only a window list only the rows it holds, and "All" would then show
 * part of the ledger as if it were all. The reference read to find out is the one the session starts from, so the
 * source it is given answers its first read of the reference with that one, and the reference is read once. Offline,
 * or when that read fails, a snapshot of this owner's is enough to go on, if it holds every row.
 *
 * The limit is checked here for the start of a session only. A ledger that grows past it later is caught by the
 * session itself (`refuseWindow`), and the app hands back from there.
 */
export async function chooseLedger(source: ExpenseDataSource, owner: string | undefined): Promise<Chosen> {
  if (!hasLedgerParts(source)) return 'fallback'
  const saved = async (): Promise<Chosen> => {
    const snapshot = owner ? await loadLedgerSnapshot(owner) : null
    return snapshot && snapshot.held.cells === null ? { ledger: source } : 'fallback'
  }
  if (!isOnline()) return saved()
  try {
    const reference = await source.readReferencePart()
    return reference.rowCount <= FULL_HYDRATION_ROW_LIMIT ? { ledger: startingFrom(source, reference) } : 'fallback'
  } catch {
    return saved()
  }
}
