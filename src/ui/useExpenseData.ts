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
    // Bumped here rather than inside the updater below, and unconditionally. React
    // only runs a useState updater eagerly when that hook's queue is empty, so a
    // bump placed inside it is not guaranteed to have happened by the time this
    // function returns — leaving a window where an in-flight load still reads the
    // old count. A spurious bump costs at most one discarded refresh.
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
    // Captured per load() call, not once at mount: a counter captured once would
    // make the app stop refreshing permanently after the user's first edit, which
    // is worse than the bug this guards against.
    const patchesAtStart = patchCount.current
    /**
     * A mutation landed while this load was in flight, so its response describes
     * server state from before that mutation. Replacing the model with it reverts
     * the user's edit on screen with no error, even though the server has it.
     * Checked after *every* await that precedes a setState — including the offline
     * snapshot write, which is a real IndexedDB round trip, not a cheap one.
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
     * Show the offline snapshot. Shared by the offline path and the error fallback,
     * which had the same six lines twice. Returns false only when there is no
     * snapshot to show, so the caller can fall through to an error state.
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
      // Stale, not failed: the request succeeded, we are only dropping its payload
      // because newer local state supersedes it. Still settle the refresh UI, or the
      // spinner never stops.
      if (isStale()) return void finish(refreshOk)
      await saveOfflineSnapshot(dataset)
      if (!active) return
      if (isStale()) return void finish(refreshOk)
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
