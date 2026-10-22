import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { LedgerPartsSource } from '../data/dataSource'
import { type HeldLedger, ledgerOfHeld, receiptsPending } from '../data/ledgerHold'
import { LedgerSession, type SessionOptions, type SessionState } from '../data/ledgerSession'
import { loadLedgerSnapshot, saveLedgerSnapshot } from '../data/ledgerSnapshot'
import { TransactionPager } from '../data/transactionPager'
import { buildLedgerModel, withHistory } from './buildLedgerModel'
import { pagedListOf } from './pagedTransactionList'
import type { ExpenseData, ExpenseModel, RefreshOutcome } from './useExpenseData'

const MIN_REFRESH_MS = 700
/** A search box sets the filter at every key; the list is read once the text has held still this long. */
const LIST_SETTLE_MS = 250

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const isOnline = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine)

export interface LedgerDataOptions extends SessionOptions {
  /**
   * Whose snapshot to keep and to fall back on, or none to keep no snapshot. The snapshot is the signed-in
   * owner's alone (see `ledgerSnapshot.ts`).
   */
  owner?: string | undefined
  /** Told what was held after a read that worked, a first load or a refresh; not for a snapshot or a write. */
  onSettled?: ((held: HeldLedger) => void) | undefined
}

type Phase = 'loading' | 'ready' | 'error'

/** Opens the session if the browser is online. Null when it is open, otherwise why it is not. */
async function openOnline(session: LedgerSession, opened: () => void): Promise<string | null> {
  if (!isOnline()) return 'You are offline and no saved data is available.'
  try {
    await session.open()
    opened()
    return null
  } catch (failed) {
    return reason(failed)
  }
}

/** Keeps what is held as the owner's snapshot (it never throws and nothing waits for it) and says it settled. */
function keep(session: LedgerSession, owner: string | undefined, settled: LedgerDataOptions['onSettled']): void {
  const { held, viewed } = session.getState()
  if (!held) return
  if (owner) void saveLedgerSnapshot(owner, held, viewed)
  settled?.(held)
}

const HISTORY_WORDS = {
  loading: 'Reading the recurring charges. Until they arrive, the fixed and flexible figures use only the months loaded.',
  failed: "Couldn't read the recurring charges, so the fixed and flexible figures use only the months loaded.",
  offline: "You're offline, so the fixed and flexible figures use only the months saved on this device.",
} as const

/** What a windowed model says about having no history: it is being read, the read failed, or there is no one to ask. */
function historyNoteOf(missing: boolean, { offline, seriesFailed }: SessionState): string | undefined {
  if (!missing) return undefined
  return HISTORY_WORDS[offline ? 'offline' : seriesFailed ? 'failed' : 'loading']
}

interface Shown {
  phase: Phase
  model: ExpenseModel | undefined
  offline: boolean
  outsized: boolean
  snapshotAt: string | undefined
  failure: string | undefined
}

/** What the screens are given of the model: nothing while it loads, after a failure, or when a read was kept out. */
function shown({ phase, model, offline, outsized, snapshotAt, failure }: Shown): Pick<ExpenseData, 'status' | 'model' | 'fromCache' | 'snapshotAt' | 'error'> {
  if (phase === 'ready' && model !== undefined && !outsized) {
    return { status: 'ready', model, fromCache: offline, ...(offline && snapshotAt ? { snapshotAt } : {}) }
  }
  if (phase === 'error') return { status: 'error', ...(failure !== undefined ? { error: failure } : {}) }
  return { status: 'loading' }
}

/**
 * The model of a ledger held open, for the screens that `useExpenseData` serves from the whole dataset. A
 * write is patched in at once; one the server answered with more than the patch shows is followed by a read
 * of the whole ledger (`LedgerSession`). `viewMonth` tells it which month the screens show, so that the
 * rows of that month's window are read. Receipt lists are read when a screen asks for them (`ensureReceipts`).
 *
 * Offline, or when the read fails, the owner's snapshot is shown instead and the session is read-only until a
 * refresh reads. Every read that works replaces the snapshot.
 */
export function useLedgerData(source: LedgerPartsSource, options?: LedgerDataOptions): ExpenseData {
  const owner = options?.owner
  const settled = useRef(options?.onSettled)
  useEffect(() => {
    settled.current = options?.onSettled
  })
  const session = useMemo(() => new LedgerSession(source, options), [source]) // eslint-disable-line react-hooks/exhaustive-deps -- options are read once
  const state = useSyncExternalStore(session.subscribe, session.getState)
  const pager = useMemo(() => new TransactionPager(source, { settleMs: LIST_SETTLE_MS }), [source])
  const pagedList = useMemo(() => pagedListOf(pager), [pager])
  useEffect(() => () => pager.dispose(), [pager])
  const [phase, setPhase] = useState<Phase>('loading')
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [snapshotAt, setSnapshotAt] = useState<string | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshOutcome, setRefreshOutcome] = useState<RefreshOutcome>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    const restore = async (): Promise<boolean> => {
      const snapshot = owner ? await loadLedgerSnapshot(owner) : null
      if (!snapshot || !alive.current) return false
      if (!session.restore(snapshot.held, snapshot.viewed)) return false
      setSnapshotAt(snapshot.savedAt)
      return true
    }
    const begin = async () => {
      const error = await openOnline(session, () => keep(session, owner, settled.current))
      if (error === null || (await restore())) return setPhase('ready')
      if (!alive.current) return
      setFailure(error)
      setPhase('error')
    }
    void begin()
    return () => {
      alive.current = false
    }
  }, [session, owner, attempt])

  const { held, series } = state
  // A ledger held in full has every row to work the series out from, as the screens do without a history.
  const windowed = held !== null && held.cells !== null
  const note = historyNoteOf(windowed && !series, state)
  const model = useMemo<ExpenseModel | undefined>(() => {
    if (!held) return undefined
    const built = buildLedgerModel(ledgerOfHeld(held), { attachmentCounts: held.attachmentCounts })
    const withSeries = windowed && series ? withHistory(built, series) : built
    return {
      ...withSeries,
      receiptsPending: receiptsPending(held),
      ensureReceipts: session.loadReceipts,
      watchHistory: session.watchSeries,
      pagedList,
      ...(note ? { historyNote: note } : {}),
    }
  }, [held, series, windowed, note, session, pagedList])

  const reload = useCallback(() => {
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
      () => {
        keep(session, owner, settled.current)
        pager.refresh({ summary: true })
        return finish('ok')
      },
      () => finish('fail'),
    )
  }, [session, pager, phase, owner])

  // A list read from the server does not see a write until it is read again.
  const applyPatch = useCallback<ExpenseData['applyPatch']>(
    (patch, reach) => {
      if (session.patch(patch, reach)) pager.refresh({ summary: true })
    },
    [session, pager],
  )
  const viewMonth = useCallback((month: string) => void session.view(month), [session])

  return {
    ...shown({ phase, model, offline: state.offline, outsized: state.outsized, snapshotAt, failure }),
    refreshing,
    refreshOutcome,
    reload,
    applyPatch,
    viewMonth,
    hydrating: state.hydrating,
    backgroundError: phase === 'ready' && model !== undefined && !state.outsized ? state.error : null,
    outsized: state.outsized,
  }
}
