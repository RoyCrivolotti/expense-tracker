import { useEffect, useMemo, useRef, useState } from 'react'
import { dismissRecommendation } from '../../data/recommendationDecisionsApi'
import type { RecommendationInfo } from '../../data/recommendationsApi'
import { buildMerchantIndex } from '../../domain/capture/review'
import type { SeriesFit, SeriesHint } from '../../domain/capture/seriesMatch'
import type { WaitingTotals } from '../../domain/capture/totals'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { useStoppedSuggestions } from '../tabs/stoppedSuggestions'
import type { ExpenseModel } from '../useExpenseData'
import { useHistoryWatch } from '../useHistoryWatch'
import { rememberCardOf } from './cardLinks'
import type { ReviewCore } from './reviewContext'
import { describeRecommendation, transactionOf, type ReviewView } from './reviewFields'
import { seriesHintsOf } from './reviewSeries'
import { toastText } from './reviewFormat'
import { introOf } from './reviewIntro'
import { billPairs, pairSides, tiedOrder, totalsOf } from './reviewPairs'
import { queuedSeed } from './reviewQueue'
import { rowTitle } from './reviewRowText'
import { localToday } from './reviewToday'
import type { PairSide } from './reviewWhy'

/** What the card, the sheet and the rows work with: the payments as the seven fields, and what a person can do with each. */
export interface ReviewApi {
  /** Newest day first, with the announcement of a same-bill pair right under its charge. */
  views: ReviewView[]
  /** The two halves of each bill that may be waiting twice, by payment id. */
  pairs: ReadonlyMap<string, PairSide>
  /** Money in and out across the payments. Null while more wait than are loaded, when a sum would be short. */
  totals: WaitingTotals | null
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
  /** Removes the announcement of the pair this payment is in, and nothing else. The charge stays to be reviewed. */
  dismissDuplicate: (view: ReviewView) => void
  /** Opens the add form on this payment, with the ones after it queued behind it. */
  review: (view: ReviewView) => void
  /** Opens the add form on this payment filled from one of the series its hint offers, which the person picked. */
  reviewAs: (
    view: ReviewView,
    series: SeriesFit,
  ) => void
}

/** The payment with the account its card was just linked to, when it was. */
function withLink(
  rec: RecommendationInfo,
  linked: ReadonlyMap<string, number>,
): RecommendationInfo {
  const account = rec.card ? linked.get(`${rec.card.source}:${rec.card.digits}`) : undefined
  return account === undefined ? rec : { ...rec, accountId: account }
}

const name = (view: ReviewView) => rowTitle(view).long

/**
 * The payments as the seven fields, each with what the monthly series say it may be. The series are the recurring
 * card's, so the card reads the whole history the way it does, and leaves out the series the person stopped there.
 */
function useViews(
  items: readonly RecommendationInfo[],
  model: ExpenseModel,
) {
  const merchants = useMemo(() => buildMerchantIndex(model.dataset.transactions), [model.dataset.transactions])
  useHistoryWatch(model)
  const { stopped } = useStoppedSuggestions()
  const hints = useMemo(() => seriesHintsOf(items, model, merchants, stopped), [items, model, merchants, stopped])
  const { views, pairs, totals } = useMemo(() => {
    const listed = items.map((r) => describeRecommendation(r, model, merchants, hints.get(r.id)))
    const bills = billPairs(listed)
    return { views: tiedOrder(listed, bills), pairs: pairSides(listed, bills), totals: totalsOf(listed, bills) }
  }, [items, model, merchants, hints])
  // The queue reads the latest views when it moves on, not the ones it started with.
  const latest = useRef(views)
  useEffect(() => {
    latest.current = views
  }, [views])
  const describe = (
    rec: RecommendationInfo,
    hint: SeriesHint,
  ) => describeRecommendation(rec, model, merchants, hint)
  return { views, pairs, totals, latest, describe }
}

/** Works the payments out as the seven fields a person sees, and turns a press into a held decision. */
export function useReviewApi(core: ReviewCore): ReviewApi {
  const { model, decide, submit, openForm } = core
  const format = useMoneyFormat()
  // Cards just linked, by `source:digits`, until the next read brings the server's own accounts.
  const [linked, setLinked] = useState<ReadonlyMap<string, number>>(new Map())
  const [seenLoads, setSeenLoads] = useState(core.loads)
  if (seenLoads !== core.loads) {
    setSeenLoads(core.loads)
    setLinked(new Map())
  }
  const items = useMemo(() => core.items.map((r) => withLink(r, linked)), [core.items, linked])
  const { views, pairs, totals, latest, describe } = useViews(items, model)

  const dontAdd = (view: ReviewView) => {
    const message = `Not added \u00b7 ${name(view)}\nOnly this suggestion is removed. Nothing is created and the app learns nothing.`
    decide(view.rec.id, message, `remove ${name(view)}`, () => dismissRecommendation(view.rec.id))
  }
  const rememberFor = (v: ReviewView) =>
    rememberCardOf(v, (key, accountId) => setLinked((held) => new Map(held).set(key, accountId)))
  const reviewAs = (
    view: ReviewView,
    series: SeriesFit,
  ) => review(describe(view.rec, { kind: 'series', series }))
  function review(view: ReviewView) {
    const at = latest.current.findIndex((v) => v.rec.id === view.rec.id)
    const after = latest.current.slice(at + 1).map((v) => v.rec.id)
    const intro = (v: ReviewView) => introOf(v, pairs.get(v.rec.id), format, localToday())
    openForm(queuedSeed(view, after, { latest: () => latest.current, dontAdd, rememberFor, choose: reviewAs, intro }))
  }
  return {
    views,
    pairs,
    totals: core.hasMore ? null : totals,
    count: core.count,
    hasMore: core.hasMore,
    more: core.more,
    error: core.error,
    retry: core.retry,
    failures: core.failures,
    canWrite: core.canWrite,
    add: (view) => {
      const input = transactionOf(view)
      if (input && submit)
        decide(view.rec.id, toastText('Added', view, format), `add ${name(view)}`, () => submit(view.rec.id, input))
    },
    dontAdd,
    dismissDuplicate: (view) => {
      const side = pairs.get(view.rec.id)
      if (side) dontAdd(side.role === 'announcement' ? view : side.other)
    },
    review,
    reviewAs,
  }
}
