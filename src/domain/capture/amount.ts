import type { DecimalMark } from './types'

export interface ParsedAmount {
  /** Positive integer cents. */
  cents: number
  negative: boolean
}

const CURRENCY = '(?:\\s?(?:EUR|€))?'
const PREFIX = '(?:€\\s?)?'

/** Largest amount a bank push is believed to carry, in cents. A bigger one is a misread. */
export const MAX_AMOUNT_CENTS = 100_000_000

// Each mark only treats its own character as the decimal point, because the other one is a
// thousands separator or a typo, never a decimal.
const SHAPES: Record<DecimalMark, string> = {
  comma: `${PREFIX}(-)?(\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,(\\d{1,2}))?${CURRENCY}`,
  dot: `${PREFIX}(-)?(\\d+)(?:\\.(\\d{1,2}))?${CURRENCY}`,
}

function toAmount(match: RegExpMatchArray): ParsedAmount | null {
  const whole = (match[2] ?? '').replaceAll('.', '')
  const fraction = (match[3] ?? '').padEnd(2, '0')
  const cents = Number(whole) * 100 + Number(fraction)
  if (cents <= 0 || cents > MAX_AMOUNT_CENTS) return null
  return { cents, negative: match[1] === '-' }
}

/** Reads a string that is nothing but an amount: `10.50`, `-10.5`, `4.0` or `50,00EUR`. */
export function parseAmount(text: string, mark: DecimalMark): ParsedAmount | null {
  const match = text.trim().match(new RegExp(`^${SHAPES[mark]}$`, 'i'))
  return match ? toAmount(match) : null
}

/**
 * Finds the amount in a body, or null when it cannot be told safely. A token marked with a currency
 * wins. A bare number is accepted only when it is the one number in the body, because with two
 * there is no telling a time, a count or a card's digits from the amount. Never a guess (incomplete).
 */
export function findAmount(body: string, mark: DecimalMark): ParsedAmount | null {
  const token = new RegExp(`(?<![\\w.,:]|[*•·…]\\s?)${SHAPES[mark]}(?!\\w|[.,:]\\d|:)`, 'gi')
  const found = [...body.matchAll(token)]
  const marked = found.filter((m) => /^€|(EUR|€)$/i.test(m[0]))
  const chosen = marked.length > 0 ? marked[0] : found.length === 1 ? found[0] : undefined
  return chosen ? toAmount(chosen) : null
}
