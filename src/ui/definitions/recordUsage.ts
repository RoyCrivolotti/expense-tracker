import { useMemo } from 'react'
import type { Usage } from '../../domain/data/usage'
import { usageFromDataset } from '../../domain/engine/recordUsage'
import type { ExpenseModel } from '../useExpenseData'

export type UsageKind = 'category' | 'account' | 'flag' | 'label'

/**
 * How many records name each category, account, flag and label, and whether to trust it. A model that holds every
 * row counts them itself and is always sure; one that holds a window is told by the server (`useUsage` of the
 * model), which takes time and can fail.
 */
export interface UsageView {
  /** The counts, or null before any has been read. */
  usage: Usage | null
  /** Why they cannot be taken as they are: being read, read before a write that could change them, or not readable. */
  note: 'reading' | 'stale' | 'failed' | null
  /** Reads them again. */
  refresh: () => void
}

/**
 * What names one record, as the server's delete check counts it: a category or account is in use by a transaction of
 * any status, an instalment plan or (an account) a month statement, a flag or label by a transaction. Null when the
 * counts have not been read, which is not zero and must not be taken for it.
 */
export function usageCount(usage: Usage | null, kind: UsageKind, id: number): number | null {
  if (usage === null) return null
  if (kind === 'flag') return usage.flags.find((f) => f.id === id)?.transactions ?? 0
  if (kind === 'label') return usage.labels.find((l) => l.id === id)?.transactions ?? 0
  if (kind === 'category') {
    const c = usage.categories.find((record) => record.id === id)
    return c ? c.transactions + c.plans : 0
  }
  const a = usage.accounts.find((record) => record.id === id)
  return a ? a.transactions + a.plans + a.statements : 0
}

const noRefresh = (): void => undefined

/** The counts of a model that holds every row. */
function useHeldUsage(model: ExpenseModel): UsageView {
  const usage = useMemo(() => usageFromDataset(model.dataset), [model.dataset])
  return useMemo(() => ({ usage, note: null, refresh: noRefresh }), [usage])
}

/** The counts for the Settings screens, from the model's own rows or, for a window, from the server. */
export function useRecordUsage(model: ExpenseModel): UsageView {
  return (model.useUsage ?? useHeldUsage)(model)
}
