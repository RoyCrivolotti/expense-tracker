import { useEffect, useMemo, useRef } from 'react'
import { dismissRecommendation, linkRecommendation } from '../../data/recommendationsApi'
import { buildMerchantIndex } from '../../domain/capture/review'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import type { ReviewCore } from './reviewContext'
import { describeRecommendation, transactionOf, type ReviewView } from './reviewFields'
import { toastText } from './reviewFormat'
import { queuedSeed } from './reviewQueue'

/** What the card, the sheet and the rows work with: the payments as the seven fields, and what a person can do with each. */
export interface ReviewApi {
  views: ReviewView[]
  count: number
  hasMore: boolean
  more: () => void
  error: string | null
  retry: () => void
  failures: ReadonlyMap<string, string>
  canWrite: boolean
  /** One tap. Only does anything for a payment `oneTap` allows. */
  add: (view: ReviewView) => void
  dontAdd: (view: ReviewView) => void
  /** Links the payment to the typed row the server says looks the same. Only for a payment with `possibleMatch`. */
  link: (view: ReviewView) => void
  /** Opens the add form on this payment, with the ones after it queued behind it. */
  review: (view: ReviewView) => void
}

const name = (view: ReviewView) => view.description || 'Payment'

/** Works the payments out as the seven fields a person sees, and turns a press into a held decision. */
export function useReviewApi(core: ReviewCore): ReviewApi {
  const { model, items, decide, submit, openForm } = core
  const format = useMoneyFormat()
  const merchants = useMemo(() => buildMerchantIndex(model.dataset.transactions), [model.dataset.transactions])
  const views = useMemo(() => items.map((r) => describeRecommendation(r, model, merchants)), [items, model, merchants])
  // The queue reads the latest views when it moves on, not the ones it started with.
  const latest = useRef(views)
  useEffect(() => {
    latest.current = views
  }, [views])

  const dontAdd = (view: ReviewView) => {
    const message = `Not added \u00b7 ${name(view)}\nOnly this suggestion is removed. Nothing is created and the app learns nothing.`
    decide(view.rec.id, message, `remove ${name(view)}`, () => dismissRecommendation(view.rec.id))
  }
  return {
    views,
    count: core.count,
    hasMore: core.hasMore,
    more: core.more,
    error: core.error,
    retry: core.retry,
    failures: core.failures,
    canWrite: core.canWrite,
    add: (view) => {
      const input = transactionOf(view)
      if (input && submit) decide(view.rec.id, toastText('Added', view, format), `add ${name(view)}`, () => submit(view.rec.id, input))
    },
    dontAdd,
    link: (view) => {
      const match = view.rec.possibleMatch
      if (!match) return
      const message = `Linked \u00b7 ${name(view)}\nTo your typed row "${match.description}". Nothing new is added.`
      decide(view.rec.id, message, `link ${name(view)}`, () => linkRecommendation(view.rec.id, match.id))
    },
    review: (view) => {
      const at = latest.current.findIndex((v) => v.rec.id === view.rec.id)
      const after = latest.current.slice(at + 1).map((v) => v.rec.id)
      openForm(queuedSeed(view, after, () => latest.current, dontAdd))
    },
  }
}
