import { type ExpenseDataSource, type LedgerPartsSource, hasLedgerParts } from './dataSource'
import { loadLedgerSnapshot } from './ledgerSnapshot'
import { MAX_ROWS_PER_REQUEST, type ReferencePart } from '../domain/data/ledgerParts'
import { startingFrom } from './priorReference'

export type LedgerSource = ExpenseDataSource & LedgerPartsSource

/** `'fallback'` is the whole-dataset app; anything else is the ledger, with the source that serves its parts. */
export type Chosen = 'fallback' | { ledger: LedgerSource }

/** Only a browser that says it is offline is: where there is no `navigator.onLine` to ask, the network is tried. */
const isOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false

/**
 * A month of more rows than one request returns cannot be read as rows (`planRowRanges` refuses it), and the
 * whole-dataset app, whose one read has no such bound, is the only app that opens that ledger.
 */
const hasOversizedMonth = ({ rowsPerMonth }: ReferencePart): boolean =>
  Object.values(rowsPerMonth).some((rows) => rows > MAX_ROWS_PER_REQUEST)

/**
 * Whether to read this ledger in parts. Not when the source cannot serve parts (an older server answers with
 * `PartsUnavailableError` on its first read), not when one month holds more rows than a request returns, and not
 * when the reference cannot be read and this owner has no snapshot to go on. The size of the ledger is not a reason:
 * it is held in full or as a window as the hydration policy says. The reference read to find out is the one the
 * session starts from, so the source it is given answers its first read of the reference with that one, and the
 * reference is read once. Offline, or when that read fails, a snapshot of this owner's, of every row or of a window,
 * is enough to go on.
 */
export async function chooseLedger(source: ExpenseDataSource, owner: string | undefined): Promise<Chosen> {
  if (!hasLedgerParts(source)) return 'fallback'
  const saved = async (): Promise<Chosen> => ((owner ? await loadLedgerSnapshot(owner) : null) ? { ledger: source } : 'fallback')
  if (!isOnline()) return saved()
  try {
    const reference = await source.readReferencePart()
    return hasOversizedMonth(reference) ? 'fallback' : { ledger: startingFrom(source, reference) }
  } catch {
    return saved()
  }
}
