import { type ReactNode, useMemo } from 'react'
import type { ExpenseDataset } from '../../types'
import type { ExpenseModel } from '../useExpenseData'

export type UsageKind = 'category' | 'account' | 'flag' | 'label'

/**
 * How many records name each category, account, flag and label, and whether to trust it. A model that holds every
 * row counts them itself and is always sure; one that holds a window is told by the server (`useUsage` of the
 * model), which takes time and can fail.
 */
export interface UsageView {
  /**
   * How many records name this one, as the server's delete check counts it: a category or account is in use by a
   * transaction of any status, an instalment plan or (an account) a month statement, a flag or label by a transaction.
   * Null when the counts have not been read, which is not zero and must not be taken for it.
   */
  count: (kind: UsageKind, id: number) => number | null
  /** Why the counts cannot be taken as they are: being read, read before a write that could change them, or not readable. */
  note: 'reading' | 'stale' | 'failed' | null
  /** Says so beside the counts, with a way to read them again where that helps. Nothing when they can be taken. */
  notice: ReactNode
}

/** The count of one record, from every row of a dataset. */
export function heldCount(d: ExpenseDataset, kind: UsageKind, id: number): number {
  switch (kind) {
    case 'category':
      return d.transactions.filter((t) => t.categoryId === id).length + d.installmentPlans.filter((p) => p.categoryId === id).length
    case 'account':
      return (
        d.transactions.filter((t) => t.accountId === id).length +
        d.installmentPlans.filter((p) => p.accountId === id).length +
        d.accountStatements.filter((s) => s.accountId === id).length
      )
    case 'flag':
      return d.transactions.filter((t) => t.flagId === id).length
    case 'label':
      return d.transactions.filter((t) => t.labelIds?.includes(id)).length
  }
}

/** The counts of a model that holds every row. */
function useHeldUsage(model: ExpenseModel): UsageView {
  return useMemo(() => ({ count: (kind, id) => heldCount(model.dataset, kind, id), note: null, notice: null }), [model.dataset])
}

/** The counts for the Settings screens, from the model's own rows or, for a window, from the server. */
export function useRecordUsage(model: ExpenseModel): UsageView {
  return (model.useUsage ?? useHeldUsage)(model)
}
