import { sameBillPairs, type BillPair } from '../../domain/capture/pairs'
import { waitingTotals, type WaitingTotals } from '../../domain/capture/totals'
import type { ReviewView } from './reviewFields'
import type { PairSide } from './reviewWhy'

/** A payment as the pair rule and the totals read it: the amount and type the person sees, not the push's first reading. */
const shown = (view: ReviewView) => ({
  id: view.rec.id,
  amountCents: view.amountCents,
  currency: view.rec.currency,
  suggestedType: view.type,
  occurredAt: view.rec.occurredAt,
  localDate: view.rec.localDate,
})

export const billPairs = (views: readonly ReviewView[]): BillPair[] => sameBillPairs(views.map(shown))

/** Each payment of a same-bill pair, by id, with which of the two it is and the other one. */
export function pairSides(
  views: readonly ReviewView[],
  pairs: readonly BillPair[],
): Map<string, PairSide> {
  const byId = new Map(views.map((v) => [v.rec.id, v]))
  const sides = new Map<string, PairSide>()
  for (const { announcement, charge } of pairs) {
    const [notice, charged] = [byId.get(announcement), byId.get(charge)]
    if (!notice || !charged) continue
    sides.set(announcement, { role: 'announcement', other: charged })
    sides.set(charge, { role: 'charge', other: notice })
  }
  return sides
}

/**
 * The payments with each announcement of a pair moved to sit right under its charge, so the two are drawn tied
 * together wherever the list would otherwise put the announcement.
 */
export function tiedOrder(
  views: readonly ReviewView[],
  pairs: readonly BillPair[],
): ReviewView[] {
  const noticeOf = new Map(pairs.map((p) => [p.charge, p.announcement]))
  const moved = new Set(noticeOf.values())
  const byId = new Map(views.map((v) => [v.rec.id, v]))
  return views
    .filter((v) => !moved.has(v.rec.id))
    .flatMap((v) => {
      const notice = byId.get(noticeOf.get(v.rec.id) ?? '')
      return notice ? [v, notice] : [v]
    })
}

/** Money in and out across the payments, a bill that waits twice counted once. */
export const totalsOf = (
  views: readonly ReviewView[],
  pairs: readonly BillPair[],
): WaitingTotals => waitingTotals(views.map(shown), pairs)
