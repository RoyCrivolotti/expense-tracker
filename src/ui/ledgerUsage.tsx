import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Usage } from '../domain/data/usage'
import type { LedgerUsage } from '../data/ledgerUsage'
import { type UsageKind, type UsageView, heldCount } from './definitions/recordUsage'
import { UsageNote } from './ledgerUsageNote'
import type { ExpenseModel } from './useExpenseData'

/** What names one record according to the server's counts, which are the whole ledger's. */
export function usageCount(usage: Usage, kind: UsageKind, id: number): number {
  if (kind === 'flag') return usage.flags.find((f) => f.id === id)?.transactions ?? 0
  if (kind === 'label') return usage.labels.find((l) => l.id === id)?.transactions ?? 0
  if (kind === 'category') {
    const c = usage.categories.find((record) => record.id === id)
    return c ? c.transactions + c.plans : 0
  }
  const a = usage.accounts.find((record) => record.id === id)
  return a ? a.transactions + a.plans + a.statements : 0
}

function useCounts(store: LedgerUsage, heldRevision: string | null, model: ExpenseModel): UsageView {
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const windowed = model.sums !== undefined
  useEffect(() => (windowed ? store.watch() : undefined), [store, windowed])
  useEffect(() => {
    const { usage } = store.getState()
    if (windowed && usage !== null && heldRevision !== null && usage.revision !== heldRevision) store.refresh()
  }, [store, windowed, heldRevision])
  const { dataset } = model
  return useMemo<UsageView>(() => {
    if (!windowed) return { count: (kind, id) => heldCount(dataset, kind, id), note: null, notice: null }
    const { usage, loading, stale, error } = state
    const behind = usage !== null && heldRevision !== null && usage.revision !== heldRevision
    const note = error !== null ? 'failed' : loading || usage === null ? 'reading' : stale || behind ? 'stale' : null
    return {
      count: (kind, id) => (usage === null ? null : usageCount(usage, kind, id)),
      note,
      notice: note === null ? null : <UsageNote note={note} refresh={store.refresh} />,
    }
  }, [store, windowed, dataset, state, heldRevision])
}

/**
 * The counts for a model of a ledger read in parts. While it holds every row they are the model's own and certain. For
 * a window they are the server's: read when a screen that shows them is on, again after a write that could change them
 * and when the rows were read at another revision than the counts, and flagged while they are being read, may be out of
 * date or could not be read. `heldRevision` is the revision the rows were read under, null after a write of this
 * browser's, which says nothing of other tabs.
 */
export function ledgerUsageHook(store: LedgerUsage, heldRevision: string | null): (model: ExpenseModel) => UsageView {
  return (model) => useCounts(store, heldRevision, model)
}
