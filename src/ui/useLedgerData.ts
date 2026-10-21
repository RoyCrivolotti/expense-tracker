import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { LedgerPartsSource } from '../data/dataSource'
import { ledgerOfHeld, receiptsPending } from '../data/ledgerHold'
import { LedgerSession, type SessionOptions } from '../data/ledgerSession'
import { buildLedgerModel } from './buildLedgerModel'
import type { ExpenseData, ExpenseModel, RefreshOutcome } from './useExpenseData'

const MIN_REFRESH_MS = 700

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error))

type Phase = 'loading' | 'ready' | 'error'

/**
 * The model of a ledger held open, for the screens that `useExpenseData` serves from the whole dataset. A
 * write is patched in at once; one the server answered with more than the patch shows is followed by a read
 * of the whole ledger (`LedgerSession`). `viewMonth` tells it which month the screens show, so that the
 * rows of that month's window are read. Receipt lists are read when a screen asks for them (`ensureReceipts`).
 * The offline snapshot is not read or written here.
 */
export function useLedgerData(source: LedgerPartsSource, options?: SessionOptions): ExpenseData {
  const session = useMemo(() => new LedgerSession(source, options), [source]) // eslint-disable-line react-hooks/exhaustive-deps -- options are read once
  const state = useSyncExternalStore(session.subscribe, session.getState)
  const [phase, setPhase] = useState<Phase>('loading')
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshOutcome, setRefreshOutcome] = useState<RefreshOutcome>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    session.open().then(
      () => alive.current && setPhase('ready'),
      (error: unknown) => {
        if (!alive.current) return
        setFailure(reason(error))
        setPhase('error')
      },
    )
    return () => {
      alive.current = false
    }
  }, [session, attempt])

  const { held } = state
  const model = useMemo<ExpenseModel | undefined>(() => {
    if (!held) return undefined
    const built = buildLedgerModel(ledgerOfHeld(held), { attachmentCounts: held.attachmentCounts })
    return { ...built, receiptsPending: receiptsPending(held), ensureReceipts: session.loadReceipts }
  }, [held, session])

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
      () => finish('ok'),
      () => finish('fail'),
    )
  }, [session, phase])

  const applyPatch = useCallback<ExpenseData['applyPatch']>((patch) => session.patch(patch), [session])
  const viewMonth = useCallback((month: string) => void session.view(month), [session])

  const ready = phase === 'ready' && model !== undefined
  return {
    status: ready ? 'ready' : phase === 'error' ? 'error' : 'loading',
    ...(ready ? { model, fromCache: false } : {}),
    ...(phase === 'error' && failure !== undefined ? { error: failure } : {}),
    refreshing,
    refreshOutcome,
    reload,
    applyPatch,
    viewMonth,
    hydrating: state.hydrating,
  }
}
