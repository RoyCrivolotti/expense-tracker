import type { TxnType } from '../types'

/**
 * Amounts are positive; the type says what they do. The one exception is an investment,
 * which may be negative: money taken back out of the portfolio (a sale to cash, a
 * dividend paid out). Shared by the stateless validation in the application layer and
 * the row-aware checks in the D1 adapter and its in-memory double, so the three agree.
 */
export const AMOUNT_SIGN_MESSAGE = 'Amounts must be positive, except a withdrawal from an investment'

export function amountSignAllowed(amountCents: number, type: TxnType): boolean {
  return amountCents >= 0 || type === 'investment'
}
