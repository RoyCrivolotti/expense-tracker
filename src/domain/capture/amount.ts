import type { DecimalMark } from './types'

export interface ParsedAmount {
  /** Positive integer cents. */
  cents: number
  negative: boolean
}

const CURRENCY = '(?:\\s?(?:EUR|€))?'

// Each mark only treats its own character as the decimal point, because the other one is a
// thousands separator or a typo, never a decimal.
const SHAPES: Record<DecimalMark, string> = {
  comma: `(-)?(\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,(\\d{1,2}))?${CURRENCY}`,
  dot: `(-)?(\\d+)(?:\\.(\\d{1,2}))?${CURRENCY}`,
}

function toAmount(match: RegExpMatchArray): ParsedAmount | null {
  const whole = (match[2] ?? '').replaceAll('.', '')
  const fraction = (match[3] ?? '').padEnd(2, '0')
  const cents = Number(whole) * 100 + Number(fraction)
  if (!Number.isSafeInteger(cents)) return null
  return { cents, negative: match[1] === '-' }
}

/** Reads a string that is nothing but an amount: `10.50`, `-10.5`, `4.0` or `50,00EUR`. */
export function parseAmount(text: string, mark: DecimalMark): ParsedAmount | null {
  const match = text.trim().match(new RegExp(`^${SHAPES[mark]}$`, 'i'))
  return match ? toAmount(match) : null
}

/**
 * Finds the first amount in a body. A token with a currency is preferred over a bare number, which
 * could be a date or a count. Digits after a mask character are a card's, never an amount.
 */
export function findAmount(body: string, mark: DecimalMark): ParsedAmount | null {
  const token = new RegExp(`(?<![\\w.,]|[*•·…]\\s?)${SHAPES[mark]}(?!\\w|[.,]\\d)`, 'gi')
  const found = [...body.matchAll(token)]
  const chosen = found.find((m) => /(EUR|€)$/i.test(m[0])) ?? found[0]
  return chosen ? toAmount(chosen) : null
}
