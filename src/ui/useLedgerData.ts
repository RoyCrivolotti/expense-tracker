import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { LedgerPartsSource } from '../data/dataSource'
import type { HeldLedger } from '../data/ledgerHold'
import type { SessionOptions } from '../data/ledgerSession'
import { TransactionPager } from '../data/transactionPager'
import { onWriteReceipt } from '../data/writeReceipts'
import { historyNoteOf, ledgerModelOf } from './ledgerDataModel'
import { sessionWithCounts, useListFailure } from './ledgerWrites'
import { pagedListOf } from './pagedTransactionList'
import { openLedger, reloadLedger, type Phase } from './useLedgerLoad'
import type { ExpenseData, ExpenseModel, RefreshOutcome } from './useExpenseData'

/** A search box sets the filter at every key; the list is read once the text has held still this long. */
const LIST_SETTLE_MS = 250

export interface LedgerDataOptions extends SessionOptions {
  /**
   * Whose snapshot to keep and to fall back on, or none to keep no snapshot. The snapshot is the signed-in
   * owner's alone (see `ledgerSnapshot.ts`).
   */
  owner?: string | undefined
  /** Told what was held after a read that worked, a first load or a refresh; not for a snapshot or a write. */
  onSettled?: ((held: HeldLedger) => void) | undefined
}

interface Shown {
  phase: Phase
  model: ExpenseModel | undefined
  offline: boolean
  snapshotAt: string | undefined
  failure: string | undefined
}

/** What the screens are given of the model: nothing while it loads, after a failure, or when a read was kept out. */
function shown({
  phase,
  model,
  offline,
  snapshotAt,
  failure,
}: Shown): Pick<ExpenseData, 'status' | 'model' | 'fromCache' | 'snapshotAt' | 'error'> {
  if (phase === 'ready' && model !== undefined) {
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
export function useLedgerData(
  source: LedgerPartsSource,
  options?: LedgerDataOptions,
): ExpenseData {
  const owner = options?.owner
  const settled = useRef(options?.onSettled)
  useEffect(() => {
    settled.current = options?.onSettled
  })
  const pager = useMemo(() => new TransactionPager(source, { settleMs: LIST_SETTLE_MS }), [source])
  const [session, usage] = useMemo(() => sessionWithCounts(source, pager, options), [source, pager]) // eslint-disable-line react-hooks/exhaustive-deps -- options are read once
  const state = useSyncExternalStore(session.subscribe, session.getState)
  const pagedList = useMemo(() => pagedListOf(pager), [pager])
  useEffect(() => () => pager.dispose(), [pager])
  useEffect(() => onWriteReceipt(session.noteReceipt), [session])
  const [phase, setPhase] = useState<Phase>('loading')
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [snapshotAt, setSnapshotAt] = useState<string | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshOutcome, setRefreshOutcome] = useState<RefreshOutcome>(null)
  const { failure: listFailure, noteRead, applyPatch } = useListFailure(session, pager)
  const alive = useRef(true)

  useEffect(
    () => openLedger(session, owner, { alive, settled, setPhase, setFailure, setSnapshotAt }),
    [session, owner, attempt],
  )

  const { held, series, offline } = state
  // A ledger held in full has every row to work the series out from, as the screens do without a history.
  const windowed = held !== null && held.cells !== null
  const note = historyNoteOf(windowed && !series, state)
  const model = useMemo<ExpenseModel | undefined>(
    () => ledgerModelOf({ held, series, windowed, offline, note, session, usage, pagedList, source }),
    [held, series, windowed, offline, note, session, usage, pagedList, source],
  )

  const reload = useCallback(
    () =>
      reloadLedger(
        { session, pager, phase, owner, noteRead, alive, settled },
        { setPhase, setAttempt, setRefreshing, setRefreshOutcome },
      ),
    [session, pager, phase, owner, noteRead],
  )

  const viewMonth = useCallback((month: string) => void session.view(month), [session])

  return {
    ...shown({ phase, model, offline: state.offline, snapshotAt, failure }),
    refreshing,
    refreshOutcome,
    reload,
    applyPatch,
    viewMonth,
    hydrating: state.hydrating,
    backgroundError: phase === 'ready' && model !== undefined ? (state.error ?? listFailure) : null,
  }
}
