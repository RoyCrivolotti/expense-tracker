import { useEffect, useMemo, useState } from 'react'
import { type Lookalike, lookalikesOf } from '../../domain/capture/seriesLookalike'
import type { RecommendationInfo } from '../../data/recommendationsApi'
import type { TransactionSeed } from '../actions'
import type * as PushCode from '../capture/recurringMarks'
import { useReviewCore } from '../capture/reviewContext'
import type { ExpenseModel } from '../useExpenseData'
import { useStoppedSuggestions } from './stoppedSuggestions'
import type { UpcomingSuggestion } from './useUpcoming'

type PushModule = typeof PushCode

/** What the recurring card says about one of its charges. */
export interface RecurringMark {
  /** The waiting bank push that is this charge, as the add form opens it. "+" opens it instead of a new row. */
  push: TransactionSeed | null
  /** A row that may already be this charge under another name. Said, never acted on. */
  maybeAdded: Lookalike | null
}

/** A charge the card offers, with what the bank pushes and the rows logged say about it. */
export type MarkedSuggestion = UpcomingSuggestion & { mark?: RecurringMark }

/**
 * How long the card waits for the first read of the bank pushes before it shows without their marks. The read starts
 * with the app, so it has nearly always landed by the time the Transactions tab is open; this only bounds one that
 * hangs.
 */
export const MARKS_WAIT_MS = 3000

const NO_PUSHES: readonly RecommendationInfo[] = []

/** The module once fetched, kept for the session so a later visit to the tab shows the card at once. */
let fetched: { module: PushModule | null } | null = null

/** The capture code that reads pushes, fetched only once there are pushes waiting: it lives in the capture chunks. */
function usePushModule(wanted: boolean) {
  const [loaded, setLoaded] = useState(fetched)
  useEffect(() => {
    if (!wanted || loaded) return
    let current = true
    import('../capture/recurringMarks').then(
      (module) => {
        fetched = { module }
        if (current) setLoaded(fetched)
      },
      // Without the chunk (offline, a stale deploy) the card shows without push marks, as it did before.
      () => current && setLoaded({ module: null }),
    )
    return () => {
      current = false
    }
  }, [wanted, loaded])
  return loaded
}

/** True once the first read of the bank pushes has landed or failed, or has taken longer than `MARKS_WAIT_MS`. */
function usePushesRead(read: boolean) {
  const [gaveUp, setGaveUp] = useState(false)
  useEffect(() => {
    if (read) return
    const timer = setTimeout(() => setGaveUp(true), MARKS_WAIT_MS)
    return () => clearTimeout(timer)
  }, [read])
  return read || gaveUp
}

/**
 * What the recurring card says about each charge: the waiting push that is it (`pushesForCharges`), and a row logged
 * under another name that may be it (`lookalikesOf`). `ready` stays false until the pushes are known, so the card
 * shows with its marks rather than growing a line under a finger already on a "+". A push read later (the app
 * coming back to the front) can still add one.
 */
export function useRecurringMarks(
  model: ExpenseModel,
  suggestions: readonly UpcomingSuggestion[],
): { ready: boolean; suggestions: MarkedSuggestion[] } {
  const core = useReviewCore()
  const pushes = core?.items ?? NO_PUSHES
  const wanted = suggestions.length > 0 && pushes.length > 0
  const loaded = usePushModule(wanted)
  const read = usePushesRead(!core || core.loads > 0 || core.error !== null)
  const { stopped } = useStoppedSuggestions()
  const { transactions } = model.dataset
  const groups = model.history?.groups
  const lookalikes = useMemo(() => lookalikesOf(suggestions, transactions, groups), [suggestions, transactions, groups])
  const module = wanted ? loaded?.module : null
  const seeds = useMemo(
    () => module?.pushesForCharges(suggestions, model, pushes, stopped) ?? new Map<string, TransactionSeed>(),
    [module, suggestions, model, pushes, stopped],
  )
  const marked = useMemo(
    () =>
      suggestions.map((s): MarkedSuggestion => {
        const push = seeds.get(s.seriesKey) ?? null
        const maybeAdded = lookalikes.get(s.seriesKey) ?? null
        return push || maybeAdded ? { ...s, mark: { push, maybeAdded } } : s
      }),
    [suggestions, seeds, lookalikes],
  )
  return { ready: read && (!wanted || loaded !== null), suggestions: marked }
}
