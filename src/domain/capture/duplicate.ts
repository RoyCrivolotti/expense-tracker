import type { SuggestedType } from './types'
import { paymentDirection, rowDirection } from './direction'
import { isAnnounced, shiftDay } from './reviewDates'

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
  /** The push itself, when the payment came from one: what `mayAnswerBoth` reads. */
  push?: PushDates
}

/** A push's two dates as a recommendation keeps them: its arrival on the phone's clock and the day it is dated by. */
export interface PushDates {
  occurredAt: string
  localDate: string
}

/** What the check needs of a typed row. */
export interface TypedRow {
  id: number
  date: string
  description: string
  type: string
  /** As stored: positive for every type, except an investment taken back out, which is negative. */
  amountCents: number
  /** The push of the recommendation the row answers for, when one does. Absent or null for a row none answers for. */
  answers?: PushDates | null
}

/** A typed row that looks like the same payment. */
export interface PossibleMatch {
  transactionId: number
  description: string
  date: string
}

export { type Direction, paymentDirection, rowDirection } from './direction'

/** Whether the app can look for a match at all: a known direction, an amount above zero, and euros. */
export function canMatch(
  p: PaymentToMatch,
): p is PaymentToMatch & { amountCents: number; suggestedType: SuggestedType } {
  return (
    p.suggestedType !== null &&
    p.amountCents !== null &&
    p.amountCents > 0 &&
    (p.currency === null || p.currency === 'EUR')
  )
}

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000

/** The typed row's date minus the payment's, in days. Negative when the row is earlier. */
export function dayGap(
  rowDate: string,
  paymentDate: string,
): number {
  return Math.round(dayNumber(rowDate) - dayNumber(paymentDate))
}

/** The dates a row may carry to be a candidate for these payments: the earliest and latest across them, widened by the window. */
export function candidateSpan(payments: readonly PaymentToMatch[]): { from: string; to: string } | null {
  const dates = payments
    .filter(canMatch)
    .map((p) => p.localDate)
    .sort()
  const first = dates[0]
  const last = dates[dates.length - 1]
  if (first === undefined || last === undefined) return null
  return { from: shiftDay(first, -DUPLICATE_WINDOW.daysBack), to: shiftDay(last, DUPLICATE_WINDOW.daysForward) }
}

/** How many days after the day an announcement names a bank may still report the charge: a week. */
export const ANNOUNCED_CHARGE_DAYS = 7

/**
 * Whether a row that answers for one push may still be the same payment as another push. Two pushes that both report a
 * movement are two payments (two coffees of one price), so a row added from one is never offered to the other. A bank
 * that announces a bill and then reports the charge sends two pushes for one payment, so a row added from either is
 * offered to the other, but only when the announcement arrived first and the charge is dated on the day it named or
 * up to `ANNOUNCED_CHARGE_DAYS` later. An announcement after a charge, or a payment before the named day, is another
 * payment. Two announcements of one price stay apart: they may be two bills.
 */
export function mayAnswerBoth(
  payment: PushDates | undefined,
  answers: TypedRow['answers'],
): boolean {
  if (answers == null) return true
  if (!payment) return false
  const paymentAnnounced = isAnnounced(payment.occurredAt, payment.localDate)
  if (paymentAnnounced === isAnnounced(answers.occurredAt, answers.localDate)) return false
  const [announcement, report] = paymentAnnounced ? [payment, answers] : [answers, payment]
  if (Date.parse(announcement.occurredAt) >= Date.parse(report.occurredAt)) return false
  const late = dayGap(report.localDate, announcement.localDate)
  return late >= 0 && late <= ANNOUNCED_CHARGE_DAYS
}

/** Whether a row looks like the same payment: the same direction, the amount to the cent, and a date inside the window. */
function isMatch(
  payment: PaymentToMatch,
  row: TypedRow,
): boolean {
  if (!canMatch(payment)) return false
  if (!mayAnswerBoth(payment.push, row.answers)) return false
  // The amount first: it rules out almost every candidate, and the date arithmetic is the dearer test.
  if (Math.abs(row.amountCents) !== payment.amountCents) return false
  const signed = dayGap(row.date, payment.localDate)
  if (signed < -DUPLICATE_WINDOW.daysBack || signed > DUPLICATE_WINDOW.daysForward) return false
  return rowDirection(row.type, row.amountCents) === paymentDirection(payment.suggestedType)
}

/**
 * The payment a row about to be saved stands for, so the submit-time check judges direction exactly as the list does:
 * through `rowDirection`, where an investment stored below zero (a Withdraw) is money in. Only the direction matters to
 * the match, so it is carried by the suggested type.
 */
export function paymentOfRow(row: { date: string; type: string; amountCents: number }): PaymentToMatch {
  return {
    localDate: row.date,
    amountCents: Math.abs(row.amountCents),
    currency: 'EUR',
    suggestedType: rowDirection(row.type, row.amountCents) === 'in' ? 'income' : 'expense',
  }
}

/**
 * The typed row that looks most like this payment among `rows`: the same direction, the same amount to the cent, and a
 * date inside the window. Several give the closest by date, and a tie goes to the highest id (the row entered last).
 * The caller has already left out rows that are cancelled or belong to another person, and says of each row whether a
 * recommendation answers for it (`mayAnswerBoth`).
 */
export function possibleMatchFor(
  payment: PaymentToMatch,
  rows: readonly TypedRow[],
): PossibleMatch | null {
  let best: { row: TypedRow; gap: number } | null = null
  for (const row of rows) {
    if (!isMatch(payment, row)) continue
    const gap = Math.abs(dayGap(row.date, payment.localDate))
    if (!best || gap < best.gap || (gap === best.gap && row.id > best.row.id)) best = { row, gap }
  }
  return best ? { transactionId: best.row.id, description: best.row.description, date: best.row.date } : null
}

/** A payment of a page, with what orders it among payments of the same day. */
export interface PagePayment extends PaymentToMatch {
  id: string
  /** When the push reached the server: of two payments equally close to a row, the newer is given it first. */
  createdAt: string
}

/**
 * Each typed row goes to one payment of the page: the one it is closest to by date, the newer payment first on a tie,
 * and a payment that loses its row falls to its next best, or to none. Otherwise two payments of one price would both
 * offer the same row, and the second Link would be refused. The rule for one payment is `possibleMatchFor`.
 */
export function possibleMatchesFor(
  payments: readonly PagePayment[],
  rows: readonly TypedRow[],
): Map<string, PossibleMatch | null> {
  const pairs: Array<{ payment: PagePayment; row: TypedRow; gap: number }> = []
  for (const payment of payments) {
    for (const row of rows) {
      if (isMatch(payment, row)) pairs.push({ payment, row, gap: Math.abs(dayGap(row.date, payment.localDate)) })
    }
  }
  pairs.sort(
    (a, b) =>
      a.gap - b.gap ||
      b.payment.createdAt.localeCompare(a.payment.createdAt) ||
      b.payment.id.localeCompare(a.payment.id) ||
      b.row.id - a.row.id,
  )
  const result = new Map<string, PossibleMatch | null>(payments.map((p) => [p.id, null]))
  const taken = new Set<number>()
  for (const { payment, row } of pairs) {
    if (result.get(payment.id) !== null || taken.has(row.id)) continue
    taken.add(row.id)
    result.set(payment.id, { transactionId: row.id, description: row.description, date: row.date })
  }
  return result
}
