import type { AmountRange } from '../../engine'
import { formatCents, formatCentsCompact, tryParseMoneyToCents, type MoneyFormat } from '../../engine/money'

/**
 * What a Min or Max box holds, as the size of an amount in cents: null when it is empty or holds
 * something that is not an amount, so a half-typed or mistyped bound filters nothing rather than
 * something unexpected. A minus sign is dropped, since the bounds compare sizes.
 */
export function parseAmountBound(raw: string, format: MoneyFormat): number | null {
  if (raw.trim() === '') return null
  const cents = tryParseMoneyToCents(raw, format)
  return cents === null ? null : Math.abs(cents)
}

/** Cents typed at the end of a number. Three digits after a mark are thousands ("1.200"), as the parser reads them. */
const TYPED_CENTS = /[.,]\d{1,2}$/

/**
 * The search text read as an amount, or null when it is not one. Typed cents match exactly; a whole
 * number matches every amount with that whole part, so "64" finds 64,10 without remembering the cents.
 */
export function parseQueryAmount(query: string, format: MoneyFormat): AmountRange | null {
  const cents = tryParseMoneyToCents(query, format)
  if (cents === null) return null
  const size = Math.abs(cents)
  const number = query.replaceAll(format.symbol, '').replace(/[\s-]/g, '')
  return TYPED_CENTS.test(number) ? { fromCents: size, toCents: size } : { fromCents: size, toCents: size + 99 }
}

/** Whole amounts without ",00": a bound is usually a round number, and the chip has little room. */
function boundLabel(cents: number, format: MoneyFormat): string {
  return cents % 100 === 0 ? formatCentsCompact(cents, format) : formatCents(cents, format)
}

/** The chip for the amount bounds, or null when neither is set. Both bounds are inclusive, hence "from" and "up to". */
export function amountChipLabel(
  minCents: number | null,
  maxCents: number | null,
  format: MoneyFormat,
): string | null {
  if (minCents !== null && maxCents !== null) {
    return `${boundLabel(minCents, format)} to ${boundLabel(maxCents, format)}`
  }
  if (minCents !== null) return `From ${boundLabel(minCents, format)}`
  if (maxCents !== null) return `Up to ${boundLabel(maxCents, format)}`
  return null
}
