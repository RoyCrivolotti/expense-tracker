import { canMatch, dayGap, mayAnswerBoth, paymentDirection, type PaymentToMatch } from './duplicate'
import { isAnnounced } from './reviewDates'

/** What the pair rule needs of a payment waiting for a look, as the person will see it. */
export interface WaitingPayment extends Omit<PaymentToMatch, 'push'> {
  id: string
  /** The push's arrival on the phone's clock. With `localDate` it says whether the bank announced the payment. */
  occurredAt: string
}

/** Two waiting payments that may be one bill: the bank's announcement of it, and the charge it then reported. */
export interface BillPair {
  announcement: string
  charge: string
}

/**
 * The waiting payments that may be one bill waiting twice. A bank that announces a bill and then reports the charge
 * sends two pushes for one payment, and both wait when the person decided neither. The rule is the one that offers a
 * row added from either push to the other (`mayAnswerBoth`): the announcement arrived first and the charge is dated on
 * the day it named or up to `ANNOUNCED_CHARGE_DAYS` later. On top of it the two must be payments the app can compare
 * at all (`canMatch`), of the same amount to the cent, moving money the same way.
 *
 * A payment is in one pair at most: of several candidates the charge closest to the named day wins, then the ids, so
 * the answer does not depend on the order of the list. It only ever warns, so a wrong pair costs a glance.
 */
export function sameBillPairs(payments: readonly WaitingPayment[]): BillPair[] {
  const comparable = payments.filter(canMatch)
  const candidates: Array<BillPair & { late: number }> = []
  for (const announcement of comparable) {
    if (!isAnnounced(announcement.occurredAt, announcement.localDate)) continue
    for (const charge of comparable) {
      if (charge.amountCents !== announcement.amountCents) continue
      if (paymentDirection(charge.suggestedType) !== paymentDirection(announcement.suggestedType)) continue
      if (!mayAnswerBoth(announcement, charge)) continue
      candidates.push({
        announcement: announcement.id,
        charge: charge.id,
        late: dayGap(charge.localDate, announcement.localDate),
      })
    }
  }
  candidates.sort(
    (a, b) => a.late - b.late || a.announcement.localeCompare(b.announcement) || a.charge.localeCompare(b.charge),
  )
  const taken = new Set<string>()
  const pairs: BillPair[] = []
  for (const { announcement, charge } of candidates) {
    if (taken.has(announcement) || taken.has(charge)) continue
    taken.add(announcement).add(charge)
    pairs.push({ announcement, charge })
  }
  return pairs
}
