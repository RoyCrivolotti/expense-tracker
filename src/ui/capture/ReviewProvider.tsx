import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { PossibleMatch } from '../../data/recommendationsApi'
import { captureEnabled } from '../../config/captureFlag'
import type { ExpenseActions, TransactionSeed } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { ReviewContext, type ReviewCore } from './reviewContext'
import { useRecommendationList } from './useRecommendationList'
import { useReviewDecisions } from './useReviewDecisions'

/**
 * Reads the payments waiting for a look (only with the capture flag on) and holds what the person decides about them
 * for the undo window. What a payment becomes is worked out where it is shown (`useReviewApi`).
 */
export function ReviewProvider({
  model,
  actions,
  children,
}: {
  model: ExpenseModel
  actions: ExpenseActions | undefined
  children: ReactNode
}) {
  const [enabled] = useState(captureEnabled)
  const list = useRecommendationList(enabled)
  // Matches the server found when a one-tap add was refused, until the next read brings its own.
  const [found, setFound] = useState<ReadonlyMap<string, PossibleMatch>>(new Map())
  const [seenLoads, setSeenLoads] = useState(list.loads)
  if (seenLoads !== list.loads) {
    setSeenLoads(list.loads)
    setFound(new Map())
  }
  const matched = useCallback(
    (id: string, match: PossibleMatch) => setFound((held) => new Map(held).set(id, match)),
    [],
  )
  const decisions = useReviewDecisions(list.remove, matched)
  const items = useMemo(
    () =>
      (list.items ?? []).map((r) => {
        const match = found.get(r.id)
        return match && !r.possibleMatch ? { ...r, possibleMatch: match } : r
      }),
    [list.items, found],
  )
  const core: ReviewCore = {
    model,
    items: items.filter((r) => !decisions.hidden.has(r.id)),
    loads: list.loads,
    count: Math.max(0, list.openCount - decisions.hidden.size),
    hasMore: list.hasMore,
    more: () => void list.more(),
    error: list.error,
    retry: list.retry,
    failures: decisions.failures,
    canWrite: actions !== undefined,
    decide: (...args) => actions && decisions.decide(...args),
    submit: actions?.submitRecommendation,
    openForm: (seed: TransactionSeed) => {
      decisions.flush()
      actions?.onAdd(seed)
    },
  }
  return <ReviewContext.Provider value={enabled ? core : null}>{children}</ReviewContext.Provider>
}
