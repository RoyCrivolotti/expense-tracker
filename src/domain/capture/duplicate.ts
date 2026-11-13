import type { SuggestedType } from './types'
import { shiftDay } from './review'

/**
 * How far from a payment's local date a typed row may be and still look like the same payment.
 *
 * Back 14 days: the real case is a payment typed at the till with the push minutes later, but a person also enters
 * things days afterwards. With no limit a regular price (the 12,50 cafe) would match an old row every time and never
 * allow one tap. Forward 3 days: a person may date the row by the day the bank books it, a little after the push.
 * The submit-time check reuses this constant, so the two never disagree.
 */
export const DUPLICATE_WINDOW = { daysBack: 14, daysForward: 3 } as const

/** What the check needs of a recommendation. */
export interface PaymentToMatch {
  localDate: string
  /** Positive cents, or null when the push gave none. */
  amountCents: number | null
  currency: string | null
  suggestedType: SuggestedType | null
}

/** What the check needs of a typed row. */
export interface TypedRow {
  id: number
  date: string
  description: string
  type: string
  /** As stored: positive for every type, except an investment taken back out, which is negative. */
  amountCents: number
}

/** A typed row that looks like the same payment. */
export interface PossibleMatch {
  transactionId: number
  description: string
  date: string
}

export type Direction = 'out' | 'in'

/** Which way money moves for a suggested type. A payment whose type is not known has no direction and matches nothing. */
export function paymentDirection(type: SuggestedType | null): Direction | null {
  if (type === null) return null
  return type === 'income' || type === 'refund' ? 'in' : 'out'
}

/** Which way money moved for a typed row. An investment is money out unless it is stored negative (taken back out). */
export function rowDirection(type: string, amountCents: number): Direction {
  if (type === 'income' || type === 'refund') return 'in'
  if (type === 'investment' && amountCents < 0) return 'in'
  return 'out'
}

/** Whether the app can look for a match at all: a known direction, an amount above zero, and euros. */
export function canMatch(p: PaymentToMatch): p is PaymentToMatch & { amountCents: number; suggestedType: SuggestedType } {
  return p.suggestedType !== null && p.amountCents !== null && p.amountCents > 0 && (p.currency === null || p.currency === 'EUR')
}

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000

/** The typed row's date minus the payment's, in days. Negative when the row is earlier. */
export function dayGap(rowDate: string, paymentDate: string): number {
  return Math.round(dayNumber(rowDate) - dayNumber(paymentDate))
}

/** The dates a row may carry to be a candidate for these payments: the earliest and latest across them, widened by the window. */
export function candidateSpan(payments: readonly PaymentToMatch[]): { from: string; to: string } | null {
  const dates = payments.filter(canMatch).map((p) => p.localDate).sort()
  const first = dates[0]
  const last = dates[dates.length - 1]
  if (first === undefined || last === undefined) return null
  return { from: shiftDay(first, -DUPLICATE_WINDOW.daysBack), to: shiftDay(last, DUPLICATE_WINDOW.daysForward) }
}

/**
 * The typed row that looks most like this payment among `rows`: the same direction, the same amount to the cent, and a
 * date inside the window. Several give the closest by date, and a tie goes to the highest id (the row entered last).
 * The caller has already left out rows that are cancelled, belong to another person or already answer for a
 * recommendation.
 */
export function possibleMatchFor(payment: PaymentToMatch, rows: readonly TypedRow[]): PossibleMatch | null {
  if (!canMatch(payment)) return null
  const direction = paymentDirection(payment.suggestedType)
  let best: { row: TypedRow; gap: number } | null = null
  for (const row of rows) {
    const signed = dayGap(row.date, payment.localDate)
    if (signed < -DUPLICATE_WINDOW.daysBack || signed > DUPLICATE_WINDOW.daysForward) continue
    if (Math.abs(row.amountCents) !== payment.amountCents || rowDirection(row.type, row.amountCents) !== direction) continue
    const gap = Math.abs(signed)
    if (!best || gap < best.gap || (gap === best.gap && row.id > best.row.id)) best = { row, gap }
  }
  return best ? { transactionId: best.row.id, description: best.row.description, date: best.row.date } : null
}
