import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { type ExpenseDataSource, type LedgerPartsSource, hasLedgerParts } from '../data/dataSource'
import { reportShadow, shadowDifferences } from '../data/ledgerShadow'
import { loadLedgerSnapshot } from '../data/ledgerSnapshot'
import type { HeldLedger } from '../data/ledgerHold'
import type { LedgerMode } from '../config/ledgerMode'
import { FULL_HYDRATION_ROW_LIMIT } from '../domain/ledger'
import { AppLoadingSkeleton } from './components/AppLoadingSkeleton'
import type { ExpensesAppProps, ExpensesAppView } from './ExpensesApp'
import { useLedgerData } from './useLedgerData'

type LedgerSource = ExpenseDataSource & LedgerPartsSource

/** `fallback` is the whole-dataset app; anything else is the ledger, with the source that serves its parts. */
type Choice = 'checking' | 'fallback' | { ledger: LedgerSource }

const isOnline = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine)

/**
 * Whether to read this ledger in parts. Not when the source cannot serve parts (an older server answers
 * with `PartsUnavailableError` on its first read), and not when the ledger is too large to hold in full:
 * the screens of a ledger that holds only a window list only the rows it holds, and "All" would then show
 * part of the ledger as if it were all. The reference read is the one the session makes next, and the
 * browser answers that from its cache, so asking first costs one conditional request. Offline, or when that
 * read fails, a snapshot of this owner's is enough to go on.
 */
async function choose(source: ExpenseDataSource, owner: string | undefined): Promise<Choice> {
  if (!hasLedgerParts(source)) return 'fallback'
  const saved = async (): Promise<Choice> =>
    owner && (await loadLedgerSnapshot(owner)) ? { ledger: source } : 'fallback'
  if (!isOnline()) return saved()
  try {
    const reference = await source.readReferencePart()
    return reference.rowCount <= FULL_HYDRATION_ROW_LIMIT ? { ledger: source } : 'fallback'
  } catch {
    return saved()
  }
}

function LedgerApp({
  mode,
  ledger,
  view: View,
  ...props
}: ExpensesAppProps & { mode: Exclude<LedgerMode, 'off'>; ledger: LedgerSource; view: typeof ExpensesAppView }) {
  // Shadow mode reads the whole dataset after the ledger settles and holds the two to each other.
  const settled = useCallback(
    (held: HeldLedger) => {
      if (mode === 'shadow') void ledger.load().then((dataset) => reportShadow(shadowDifferences(held, dataset)), () => undefined)
    },
    [ledger, mode],
  )
  const data = useLedgerData(ledger, { owner: props.accountEmail, onSettled: settled })
  return <View {...props} data={data} />
}

/**
 * The app over a ledger read in parts (`src/config/ledgerMode.ts` turns this on). It lives in its own chunk,
 * so a browser that has not asked for it never loads it. It is handed the app's view rather than importing it:
 * a lazy chunk that imports its entry makes the bundler split shared code into more files loaded at startup.
 */
export default function LedgerExpensesApp({
  mode,
  fallback,
  view,
  ...props
}: ExpensesAppProps & { mode: Exclude<LedgerMode, 'off'>; fallback: ReactElement; view: typeof ExpensesAppView }) {
  const [choice, setChoice] = useState<Choice>('checking')
  const { source, accountEmail } = props
  useEffect(() => {
    let alive = true
    void choose(source, accountEmail).then((next) => alive && setChoice(next))
    return () => {
      alive = false
    }
  }, [source, accountEmail])
  if (choice === 'checking') return <AppLoadingSkeleton label="Loading expenses" />
  if (choice === 'fallback') return fallback
  return <LedgerApp {...props} mode={mode} ledger={choice.ledger} view={view} />
}
