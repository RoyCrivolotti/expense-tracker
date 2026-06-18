import { useCallback, useEffect, useState } from 'react'
import type { ExpenseDataset } from '../types'
import { sortedMonths } from '../engine/dates'
import type { ExpenseDataSource } from '../data/dataSource'
import { buildDescriptionIndex, type DescriptionIndex } from '../data/descriptionIndex'
import { buildLookup, type Lookup } from './format'

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
}

export function useExpenseData(source: ExpenseDataSource): ExpenseData {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    let active = true
    source
      .load()
      .then((dataset: ExpenseDataset) => {
        if (!active) return
        const months = sortedMonths(dataset.transactions.map((t) => t.budgetMonth))
        setState({
          status: 'ready',
          model: {
            dataset,
            lookup: buildLookup(dataset),
            descriptionIndex: buildDescriptionIndex(dataset.transactions),
            months,
          },
        })
      })
      .catch((err: unknown) => {
        if (active)
          setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      active = false
    }
  }, [source, version])

  return { ...state, reload }
}
