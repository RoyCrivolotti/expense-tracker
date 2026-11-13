import { useState, type ReactNode } from 'react'
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
export function ReviewProvider({ model, actions, children }: { model: ExpenseModel; actions: ExpenseActions | undefined; children: ReactNode }) {
  const [enabled] = useState(captureEnabled)
  const list = useRecommendationList(enabled)
  const decisions = useReviewDecisions(list.remove)
  const core: ReviewCore = {
    model,
    items: (list.items ?? []).filter((r) => !decisions.hidden.has(r.id)),
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
