import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { ExpenseDataSource } from '../data/dataSource'
import { isAccessDenied } from '../data/apiClient'
import { forgetOfflineSnapshot, loadOfflineSnapshot, saveOfflineSnapshot } from '../data/offlineCache'
import { buildExpenseModel } from './buildExpenseModel'
import type { ExpenseModel, LoadState, RefreshOutcome } from './useExpenseData'

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

const MIN_REFRESH_MS = 700

/** One load of `useExpenseData`'s effect: what it reads, and the state it settles. */
export interface LoadRun {
  source: ExpenseDataSource
  version: number
  owner: string | undefined
  /** False once the effect has been cleaned up: nothing is set after that. */
  isActive: () => boolean
  isStale: () => boolean
  refreshStartedAt: RefObject<number>
  modelRef: RefObject<ExpenseModel | undefined>
  setState: Dispatch<SetStateAction<LoadState>>
  setRefreshing: (refreshing: boolean) => void
  setRefreshOutcome: (outcome: RefreshOutcome) => void
}

interface Settlers {
  finish: (outcome: RefreshOutcome) => Promise<void>
  applyCached: (outcome: RefreshOutcome) => Promise<boolean>
}

/** How a load ends: the refresh spinner settled, and the offline snapshot shown when there is one. */
export function settlersOf(run: LoadRun): Settlers {
  const { version, owner, isActive, isStale, refreshStartedAt, modelRef, setState, setRefreshing, setRefreshOutcome } =
    run
  const finish = async (outcome: RefreshOutcome) => {
    const isUserRefresh = version > 0
    if (isUserRefresh && refreshStartedAt.current > 0) {
      const wait = MIN_REFRESH_MS - (Date.now() - refreshStartedAt.current)
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    }
    if (!isActive()) return
    setRefreshing(false)
    if (isUserRefresh) setRefreshOutcome(outcome)
  }

  /**
   * Show the offline snapshot. Returns false only when there is none, so the caller
   * can fall through to an error state.
   */
  const applyCached = async (outcome: RefreshOutcome): Promise<boolean> => {
    const cached = owner ? await loadOfflineSnapshot(owner) : null
    if (!isActive()) return true
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

  return { finish, applyCached }
}

/** The load itself: online, offline, or after an error, each settled through `settlers`. */
export function loaderOf(
  run: LoadRun,
  { finish, applyCached }: Settlers,
): () => Promise<void> {
  const { source, version, owner, isActive, isStale, modelRef, setState } = run
  const loadOffline = async () => {
    if (await applyCached(version === 0 ? null : 'fail')) return
    setState({ status: 'error', error: 'You are offline and no saved data is available.' })
    void finish('fail')
  }

  const loadOnline = async () => {
    const refreshOk: RefreshOutcome = version === 0 ? null : 'ok'
    const dataset = await source.load()
    if (!isActive()) return
    // Stale, not failed — the request succeeded, its payload is just superseded.
    // Still settle the refresh UI, or the spinner never stops. But report no
    // outcome: nothing on screen changed, and "Updated" for a response we threw
    // away is a plainer lie than the stale data this discarding exists to avoid.
    if (isStale()) return void finish(null)
    if (owner) await saveOfflineSnapshot(owner, dataset)
    if (!isActive()) return
    if (isStale()) return void finish(null)
    const model = buildExpenseModel(dataset)
    modelRef.current = model
    setState({ status: 'ready', model, fromCache: false })
    void finish(refreshOk)
  }

  const handleLoadError = async (err: unknown) => {
    if (!isActive()) return
    // The server answered and said no, so what this device kept is not for anyone to see in its place. That
    // holds for a refresh as well: the model already on screen stays, but the copy is not left on disk.
    const denied = isAccessDenied(err)
    if (denied) await forgetOfflineSnapshot()
    if (modelRef.current) return void finish('fail')
    if (!denied && (await applyCached('fail'))) return
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

  return load
}
