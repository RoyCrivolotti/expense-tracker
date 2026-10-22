import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { usageFromDataset } from '../domain/engine/recordUsage'
import type { LedgerUsage } from '../data/ledgerUsage'
import type { UsageView } from './definitions/recordUsage'
import type { ExpenseModel } from './useExpenseData'

const noRefresh = (): void => undefined

function useCounts(store: LedgerUsage, heldRevision: string | null, model: ExpenseModel): UsageView {
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const windowed = model.sums !== undefined
  useEffect(() => (windowed ? store.watch() : undefined), [store, windowed])
  useEffect(() => {
    const { usage } = store.getState()
    if (windowed && usage !== null && heldRevision !== null && usage.revision !== heldRevision) store.refresh()
  }, [store, windowed, heldRevision])
  const own = useMemo(() => (windowed ? null : usageFromDataset(model.dataset)), [windowed, model.dataset])
  return useMemo<UsageView>(() => {
    if (!windowed) return { usage: own, note: null, refresh: noRefresh }
    const { usage, loading, stale, error } = state
    const behind = usage !== null && heldRevision !== null && usage.revision !== heldRevision
    const note = error !== null ? 'failed' : loading || usage === null ? 'reading' : stale || behind ? 'stale' : null
    return { usage, note, refresh: store.refresh }
  }, [store, windowed, own, state, heldRevision])
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
