import type { DecimalMark } from './types'

/** How a run of digits and separators reads as an amount in cents, whichever decimal mark the writer uses. */

/** One reading of a number as an amount. */
export interface Candidate {
  /** Positive integer cents. */
  cents: number
  /**
   * The decimal mark of the writer this reading assumes: `comma` for `12,34` and also for `1.234`, where
   * the dot is then a thousands separator. `none` when the digits carry no separator at all.
   */
  mark: DecimalMark | 'none'
  /** True when another spelling habit would read the same text differently (`1.234`), so a learned mark may override it. */
  ambiguous?: true
}

/** Largest amount a push is believed to carry, in cents: a million in any currency. A bigger number is a misread. */
export const MAX_AMOUNT_CENTS = 100_000_000

const GROUPING = (separator: string) => new RegExp(`^[1-9]\\d{0,2}(?:\\${separator}\\d{3})+$`)
const OTHER_MARK: Record<'.' | ',', DecimalMark> = { '.': 'comma', ',': 'dot' }

function toCents(
  whole: string,
  fraction: string,
): number | null {
  if (whole.length > 10) return null
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return cents > 0 && cents <= MAX_AMOUNT_CENTS ? cents : null
}

function candidate(
  cents: number | null,
  mark: Candidate['mark'],
  ambiguous = false,
): Candidate[] {
  return cents === null ? [] : [ambiguous ? { cents, mark, ambiguous: true } : { cents, mark }]
}

function readMixed(core: string): Candidate[] {
  const decimal = core.lastIndexOf(',') > core.lastIndexOf('.') ? ',' : '.'
  const grouping = decimal === ',' ? '.' : ','
  const parts = core.split(decimal)
  const [whole = '', fraction = ''] = parts
  if (parts.length !== 2 || fraction.length > 2 || !GROUPING(grouping).test(whole)) return []
  return candidate(toCents(whole.replaceAll(grouping, ''), fraction), decimal === ',' ? 'comma' : 'dot')
}

function readSingleKind(
  core: string,
  separator: '.' | ',',
): Candidate[] {
  const parts = core.split(separator)
  const [whole = '', fraction = ''] = parts
  if (parts.length === 2 && fraction.length <= 2)
    return candidate(toCents(whole, fraction), separator === ',' ? 'comma' : 'dot')
  if (!GROUPING(separator).test(core)) return []
  return candidate(toCents(parts.join(''), ''), OTHER_MARK[separator], parts.length === 2)
}

/**
 * Reads digits and their separators (`12,34`, `1.234,56`, `4000.0`, `1.234`) as an amount, without
 * knowing which mark the writer uses. Both marks present: the last is the decimal. One kind: one or two
 * digits after it make a decimal, exactly three make a thousands group (flagged ambiguous when it is the
 * only separator), anything else is not money. No candidate is better than a wrong one.
 */
export function readNumber(core: string): Candidate[] {
  if (!/^\d+(?:[.,]\d+)*$/.test(core)) return []
  const hasDot = core.includes('.')
  const hasComma = core.includes(',')
  if (hasDot && hasComma) return readMixed(core)
  if (!hasDot && !hasComma) return candidate(toCents(core, ''), 'none')
  return readSingleKind(core, hasDot ? '.' : ',')
}
