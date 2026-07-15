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

export function useExpenseData(source: ExpenseDataSource): ExpenseData {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshOutcome, setRefreshOutcome] = useState<RefreshOutcome>(null)
  const modelRef = useRef<ExpenseModel | undefined>(undefined)

  const reload = useCallback(() => {
    setRefreshing(true)
    setRefreshOutcome(null)
    setVersion((v) => v + 1)
  }, [])

  const applyPatch = useCallback((patch: (dataset: ExpenseDataset) => ExpenseDataset) => {
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

    const finish = (outcome: RefreshOutcome) => {
      if (active) {
        setRefreshing(false)
        if (version > 0) setRefreshOutcome(outcome)
      }
    }

    const load = async () => {
      if (!isOnline()) {
        const cached = await loadOfflineSnapshot()
        if (!active) return
        if (cached) {
          const model = buildExpenseModel(cached.dataset)
          modelRef.current = model
          setState({
            status: 'ready',
            model,
            fromCache: true,
            snapshotAt: cached.savedAt,
          })
          finish(version === 0 ? null : 'fail')
        } else {
          setState({
            status: 'error',
            error: 'You are offline and no saved data is available.',
          })
          finish('fail')
        }
        return
      }

      try {
        const dataset = await source.load()
        if (!active) return
        await saveOfflineSnapshot(dataset)
        const model = buildExpenseModel(dataset)
        modelRef.current = model
        setState({ status: 'ready', model, fromCache: false })
        finish(version === 0 ? null : 'ok')
      } catch (err: unknown) {
        if (!active) return
        if (modelRef.current) {
          finish('fail')
          return
        }
        const cached = await loadOfflineSnapshot()
        if (cached) {
          const model = buildExpenseModel(cached.dataset)
          modelRef.current = model
          setState({
            status: 'ready',
            model,
            fromCache: true,
            snapshotAt: cached.savedAt,
          })
          finish('fail')
          return
        }
        const message = err instanceof Error ? err.message : String(err)
        setState({ status: 'error', error: message })
        finish('fail')
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [source, version])

  return { ...state, refreshing, refreshOutcome, reload, applyPatch }
}
