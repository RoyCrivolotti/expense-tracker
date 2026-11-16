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
 * wins, and several that disagree give null. A bare number is accepted only for a kind that really
 * writes one (`allowBare`) and only when it is the one number in the body, because otherwise a time,
 * a count or a card's digits look the same as the amount. Never a guess (incomplete).
 */
export function findAmount(body: string, mark: DecimalMark, allowBare = false): ParsedAmount | null {
  const token = new RegExp(`(?<![\\w.,:]|[*•·…]\\s?)${SHAPES[mark]}(?!\\w|[.,:]\\d|:)`, 'gi')
  const found = [...body.matchAll(token)]
  const marked = found.filter((m) => /^€|(EUR|€)$/i.test(m[0]))
  if (marked.length > 0) {
    const amounts = marked.map(toAmount)
    const [first] = amounts
    return first && amounts.every((a) => a?.cents === first.cents && a.negative === first.negative) ? first : null
  }
  return allowBare && found.length === 1 && found[0] ? toAmount(found[0]) : null
}

/**
 * The amount in a body whichever decimal mark the bank writes with. A source is not known to write one way, since a new
 * bank may write either (`4.54 EUR`, `33,40 EUR`), so both readings are tried and one that does not fit is refused
 * rather than misread: `4.54` is not a comma-mark number and `33,40` is not a dot-mark number. When both fit they must
 * agree (`40 EUR` reads the same either way), otherwise the body is ambiguous and gives null.
 */
export function findAmountAnyMark(body: string): ParsedAmount | null {
  const comma = findAmount(body, 'comma')
  const dot = findAmount(body, 'dot')
  if (comma && dot) return comma.cents === dot.cents && comma.negative === dot.negative ? comma : null
  return comma ?? dot
}
