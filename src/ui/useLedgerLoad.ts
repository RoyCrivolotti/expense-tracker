import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { HeldLedger } from '../data/ledgerHold'
import type { LedgerSession } from '../data/ledgerSession'
import { isAccessDenied } from '../data/apiClient'
import { forgetLedgerSnapshot, loadLedgerSnapshot, saveLedgerSnapshot } from '../data/ledgerSnapshot'
import type { TransactionPager } from '../data/transactionPager'
import type { RefreshOutcome } from './useExpenseData'

const MIN_REFRESH_MS = 700

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const isOnline = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine)

export type Phase = 'loading' | 'ready' | 'error'

/** The caller's `onSettled`, read when a read settles rather than when the session opened. */
type Settled = RefObject<((held: HeldLedger) => void) | undefined>

/**
 * Opens the session if the browser is online. Null when it is open, otherwise why it is not, and whether the server
 * refused the person, in which case nothing kept on this device is shown in its place.
 */
async function openOnline(
  session: LedgerSession,
  opened: () => void,
): Promise<{ message: string; denied: boolean } | null> {
  if (!isOnline()) return { message: 'You are offline and no saved data is available.', denied: false }
  try {
    await session.open()
    opened()
    return null
  } catch (failed) {
    return { message: reason(failed), denied: isAccessDenied(failed) }
  }
}

/** Keeps what is held as the owner's snapshot (it never throws and nothing waits for it) and says it settled. */
function keep(
  session: LedgerSession,
  owner: string | undefined,
  settled: ((held: HeldLedger) => void) | undefined,
): void {
  const { held, viewed } = session.getState()
  if (!held) return
  if (owner) void saveLedgerSnapshot(owner, held, viewed)
  settled?.(held)
}

interface OpenState {
  alive: RefObject<boolean>
  settled: Settled
  setPhase: (phase: Phase) => void
  setFailure: (failure: string | undefined) => void
  setSnapshotAt: (savedAt: string | undefined) => void
}

/**
 * Opens the session, or shows the owner's snapshot when it cannot be opened. The body of `useLedgerData`'s effect:
 * returns its cleanup.
 */
export function openLedger(
  session: LedgerSession,
  owner: string | undefined,
  { alive, settled, setPhase, setFailure, setSnapshotAt }: OpenState,
): () => void {
  alive.current = true
  const restore = async (): Promise<boolean> => {
    const snapshot = owner ? await loadLedgerSnapshot(owner) : null
    if (!snapshot || !alive.current) return false
    session.restore(snapshot.held, snapshot.viewed)
    setSnapshotAt(snapshot.savedAt)
    return true
  }
  const begin = async () => {
    const error = await openOnline(session, () => keep(session, owner, settled.current))
    if (error?.denied && owner) void forgetLedgerSnapshot(owner)
    if (error === null || (!error.denied && (await restore()))) return setPhase('ready')
    if (!alive.current) return
    setFailure(error.message)
    setPhase('error')
  }
  void begin()
  return () => {
    alive.current = false
  }
}

interface ReloadState {
  session: LedgerSession
  pager: TransactionPager
  phase: Phase
  owner: string | undefined
  noteRead: (worked: boolean | null) => void
  alive: RefObject<boolean>
  settled: Settled
}

interface ReloadSetters {
  setPhase: (phase: Phase) => void
  setAttempt: Dispatch<SetStateAction<number>>
  setRefreshing: (refreshing: boolean) => void
  setRefreshOutcome: (outcome: RefreshOutcome) => void
}

/** A refresh: a first open again after a failure, otherwise a read of the ledger and then of the list's page. */
export function reloadLedger(
  { session, pager, phase, owner, noteRead, alive, settled }: ReloadState,
  { setPhase, setAttempt, setRefreshing, setRefreshOutcome }: ReloadSetters,
): void {
  if (phase === 'error') {
    setPhase('loading')
    setAttempt((n) => n + 1)
    return
  }
  const startedAt = Date.now()
  setRefreshing(true)
  setRefreshOutcome(null)
  const finish = async (outcome: RefreshOutcome) => {
    const wait = MIN_REFRESH_MS - (Date.now() - startedAt)
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    if (!alive.current) return
    setRefreshing(false)
    setRefreshOutcome(outcome)
  }
  session.refresh().then(
    async () => {
      keep(session, owner, settled.current)
      const worked = await pager.refresh({ summary: true })
      noteRead(worked)
      return finish(worked === false ? 'fail' : 'ok')
    },
    () => finish('fail'),
  )
}
