import { useCallback, useEffect, useState } from 'react'
import type { ExpenseDataset } from '../types'
import type { ExpenseDataSource } from '../data/dataSource'
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
}

export interface ExpenseData extends LoadState {
  reload: () => void
  /** Apply a pure dataset transform and rebuild the view model without a network round-trip. */
  applyPatch: (patch: (dataset: ExpenseDataset) => ExpenseDataset) => void
}

export function useExpenseData(source: ExpenseDataSource): ExpenseData {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion((v) => v + 1), [])

  const applyPatch = useCallback((patch: (dataset: ExpenseDataset) => ExpenseDataset) => {
    setState((prev) => {
      if (prev.status !== 'ready' || !prev.model) return prev
      const nextDataset = patch(prev.model.dataset)
      return { status: 'ready', model: buildExpenseModel(nextDataset) }
    })
  }, [])

  useEffect(() => {
    let active = true
    source
      .load()
      .then((dataset) => {
        if (!active) return
        setState({ status: 'ready', model: buildExpenseModel(dataset) })
      })
      .catch((err: unknown) => {
        if (active)
          setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      active = false
    }
  }, [source, version])

  return { ...state, reload, applyPatch }
}
