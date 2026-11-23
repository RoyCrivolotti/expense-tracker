import type { SuggestedType } from './types'

export type Direction = 'out' | 'in'

/** Which way money moves for a suggested type. A payment whose type is not known has no direction and matches nothing. */
export function paymentDirection(type: SuggestedType | null): Direction | null {
  if (type === null) return null
  return type === 'income' || type === 'refund' ? 'in' : 'out'
}

/** Which way money moved for a typed row. An investment is money out unless it is stored negative (taken back out). */
export function rowDirection(
  type: string,
  amountCents: number,
): Direction {
  if (type === 'income' || type === 'refund') return 'in'
  if (type === 'investment' && amountCents < 0) return 'in'
  return 'out'
}
