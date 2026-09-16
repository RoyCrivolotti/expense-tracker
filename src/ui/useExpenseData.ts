import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExpenseDataset } from '../types'
import type { ExpenseDataSource } from '../data/dataSource'
import { loadOfflineSnapshot, saveOfflineSnapshot } from '../data/offlineCache'
import type { DescriptionIndex } from '../data/descriptionIndex'
import type { Lookup } from './format'
import { buildExpenseModel } from './buildExpenseModel'

export interface ExpenseModel {
  dataset: ExpenseDataset
  lookup: Lookup
  descriptionIndex: DescriptionIndex
  /** Budget months present in the data, oldest first. */
  months: string[]
}

interface LoadState {
  status: 'loading' | 'ready' | 'error'
  model?: ExpenseModel
  error?: string
  fromCache?: boolean
  snapshotAt?: string
}

export type RefreshOutcome = 'ok' | 'fail' | null

export interface ExpenseData extends LoadState {
  refreshing: boolean
  refreshOutcome: RefreshOutcome
  reload: () => void
  applyPatch: (patch: (dataset: ExpenseDataset) => ExpenseDataset) => void
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

const MIN_REFRESH_MS = 700

export function useExpenseData(source: ExpenseDataSource): ExpenseData {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshOutcome, setRefreshOutcome] = useState<RefreshOutcome>(null)
  const modelRef = useRef<ExpenseModel | undefined>(undefined)
  const refreshStartedAt = useRef(0)
  /** How many mutations have been applied locally. See `isStale` in the effect. */
  const patchCount = useRef(0)

  const reload = useCallback(() => {
    refreshStartedAt.current = Date.now()
    setRefreshing(true)
    setRefreshOutcome(null)
    setVersion((v) => v + 1)
  }, [])

  const applyPatch = useCallback((patch: (dataset: ExpenseDataset) => ExpenseDataset) => {
    // Outside the updater, and unconditional: React only runs a useState updater
    // eagerly when the queue is empty, so a bump inside it may not have happened when
    // this returns. A spurious bump costs at most one discarded refresh.
    patchCount.current += 1
    setState((prev) => {
      if (prev.status !== 'ready' || !prev.model) return prev
      const nextDataset = patch(prev.model.dataset)
      const model = buildExpenseModel(nextDataset)
      modelRef.current = model
      return { status: 'ready', model }
    })
  }, [])

  useEffect(() => {
    let active = true
    // Per load() call, not once at mount — captured once, the app would stop
    // refreshing permanently after the first edit.
    const patchesAtStart = patchCount.current
    /**
     * A mutation landed mid-load, so this response predates it and would revert the
     * user's edit on screen. Check after *every* await before a setState — including
     * the offline snapshot write, which is a real IndexedDB round trip.
     */
    const isStale = () => patchCount.current !== patchesAtStart

    const finish = async (outcome: RefreshOutcome) => {
      const isUserRefresh = version > 0
      if (isUserRefresh && refreshStartedAt.current > 0) {
        const wait = MIN_REFRESH_MS - (Date.now() - refreshStartedAt.current)
        if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      }
      if (!active) return
      setRefreshing(false)
      if (isUserRefresh) setRefreshOutcome(outcome)
    }

    /**
     * Show the offline snapshot. Returns false only when there is none, so the caller
     * can fall through to an error state.
     */
    const applyCached = async (outcome: RefreshOutcome): Promise<boolean> => {
      const cached = await loadOfflineSnapshot()
      if (!active) return true
      if (isStale()) {
        void finish(outcome)
        return true
      }
      if (!cached) return false
      const model = buildExpenseModel(cached.dataset)
      modelRef.current = model
      setState({ status: 'ready', model, fromCache: true, snapshotAt: cached.savedAt })
      void finish(outcome)
      return true
    }

    const loadOffline = async () => {
      if (await applyCached(version === 0 ? null : 'fail')) return
      setState({ status: 'error', error: 'You are offline and no saved data is available.' })
      void finish('fail')
    }

    const loadOnline = async () => {
      const refreshOk: RefreshOutcome = version === 0 ? null : 'ok'
      const dataset = await source.load()
      if (!active) return
      // Stale, not failed — the request succeeded, its payload is just superseded.
      // Still settle the refresh UI, or the spinner never stops. But report no
      // outcome: nothing on screen changed, and "Updated" for a response we threw
      // away is a plainer lie than the stale data this discarding exists to avoid.
      if (isStale()) return void finish(null)
      await saveOfflineSnapshot(dataset)
      if (!active) return
      if (isStale()) return void finish(null)
      const model = buildExpenseModel(dataset)
      modelRef.current = model
      setState({ status: 'ready', model, fromCache: false })
      void finish(refreshOk)
    }

    const handleLoadError = async (err: unknown) => {
      if (!active) return
      if (modelRef.current) return void finish('fail')
      if (await applyCached('fail')) return
      setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
      void finish('fail')
    }

    const load = async () => {
      if (!isOnline()) return loadOffline()
      try {
        await loadOnline()
      } catch (err: unknown) {
        await handleLoadError(err)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [source, version])

  return { ...state, refreshing, refreshOutcome, reload, applyPatch }
}
