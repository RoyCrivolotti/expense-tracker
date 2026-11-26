import { canMatch, paymentDirection, type PaymentToMatch } from './duplicate'
import type { BillPair } from './pairs'

/** What the totals need of a payment waiting for a look, as the person will see it. */
export interface CountedPayment extends Omit<PaymentToMatch, 'push' | 'localDate'> {
  id: string
}

/** The money waiting to be added, each way, in cents. */
export interface WaitingTotals {
  inCents: number
  outCents: number
}

/**
 * What the waiting payments add up to, money in and money out apart. Only a payment that can be added up counts: in
 * euros, with an amount, and a known direction (the test `canMatch` already makes for the duplicate check). The
 * announcement of a same-bill pair is left out, so a bill waiting twice counts once. An announced bill not yet charged
 * counts like any other: it is money about to move.
 */
export function waitingTotals(
  payments: readonly CountedPayment[],
  pairs: readonly BillPair[],
): WaitingTotals {
  const twice = new Set(pairs.map((p) => p.announcement))
  const totals = { inCents: 0, outCents: 0 }
  for (const p of payments) {
    const counted = { ...p, localDate: '' }
    if (twice.has(p.id) || !canMatch(counted)) continue
    if (paymentDirection(counted.suggestedType) === 'in') totals.inCents += counted.amountCents
    else totals.outCents += counted.amountCents
  }
  return totals
}

/** Cents as whole euros, a half rounding up: 149 is 1 and 150 is 2. The sum is rounded, never its parts. */
export function wholeEuros(cents: number): number {
  return Math.round(cents / 100)
}
