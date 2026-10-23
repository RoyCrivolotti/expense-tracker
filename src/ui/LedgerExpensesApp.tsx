import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { apiDataSource } from '../data/apiDataSource'
import { withLedgerWrites } from '../data/apiLedgerWrites'
import { type Chosen, type LedgerSource, chooseLedger } from '../data/chooseLedger'
import { reportShadow, shadowDifferences } from '../data/ledgerShadow'
import type { HeldLedger } from '../data/ledgerHold'
import type { LedgerMode } from '../config/ledgerMode'
import { AppLoadingSkeleton } from './components/AppLoadingSkeleton'
import type { ExpensesAppProps, ExpensesAppView } from './ExpensesApp'
import { useBackgroundErrorToast } from './hooks/useBackgroundErrorToast'
import { useLedgerData } from './useLedgerData'

/** What the app is showing: `checking` until the choice is made, and then what `chooseLedger` made of it. */
type Choice = 'checking' | Chosen

function LedgerApp({
  mode,
  ledger,
  view: View,
  onOutsized,
  ...props
}: ExpensesAppProps & {
  mode: Exclude<LedgerMode, 'off'>
  ledger: LedgerSource
  view: typeof ExpensesAppView
  onOutsized: () => void
}) {
  // Shadow mode reads the whole dataset after the ledger settles and holds the two to each other.
  const settled = useCallback(
    (held: HeldLedger) => {
      if (mode === 'shadow') void ledger.load().then((dataset) => reportShadow(shadowDifferences(held, dataset)), () => undefined)
    },
    [ledger, mode],
  )
  const data = useLedgerData(ledger, { owner: props.accountEmail, onSettled: settled, refuseWindow: true })
  // The lists of a ledger read in pages are longer than a request may name, so its writes to the API are the ones that split them.
  const source = useMemo(() => (props.source === apiDataSource ? withLedgerWrites(props.source) : props.source), [props.source])
  useBackgroundErrorToast(data.backgroundError, data.reload)
  // A read that found more rows than the list shows in full was kept out, so what is on screen is never part of
  // the ledger under the name of all of it: the whole dataset app takes over.
  useEffect(() => {
    if (data.outsized) onOutsized()
  }, [data.outsized, onOutsized])
  return <View {...props} source={source} data={data} />
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
  const handBack = useCallback(() => setChoice('fallback'), [])
  const { source, accountEmail } = props
  useEffect(() => {
    let alive = true
    void chooseLedger(source, accountEmail).then((next) => alive && setChoice(next))
    return () => {
      alive = false
    }
  }, [source, accountEmail])
  if (choice === 'checking') return <AppLoadingSkeleton label="Loading expenses" />
  if (choice === 'fallback') return fallback
  return <LedgerApp {...props} mode={mode} ledger={choice.ledger} view={view} onOutsized={handBack} />
}
