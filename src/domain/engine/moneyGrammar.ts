/**
 * The grammar of an amount typed into a box: which marks are group marks, which one is the decimal mark, and where
 * the sign and the currency symbol may sit. `money.ts` builds its parsers on these.
 */
import type { MoneyFormat } from './money'

/**
 * The sign and the one currency symbol taken off the edges of what was typed, leaving the number. The sign may sit
 * before or after a leading symbol ("-€5", "€-5"); a symbol may lead or trail but not both, and a second one is left
 * in the number where it fails.
 */
export function splitSymbolAndSign(
  typed: string,
  symbol: string,
): { number: string; negative: boolean } | null {
  let rest = typed
  let negative = false
  let signs = 0
  const takeSign = () => {
    if (rest.startsWith('-') || rest.startsWith('+')) {
      negative = rest.startsWith('-')
      rest = rest.slice(1).trimStart()
      signs += 1
    }
  }
  const named = symbol === '' ? '' : `${escapeRegExp(symbol)}|`
  const symbolAtStart = new RegExp(`^(?:${named}\\p{Sc})`, 'u')
  const symbolAtEnd = new RegExp(`(?:${named}\\p{Sc})$`, 'u')
  takeSign()
  let symbols = 0
  const lead = symbolAtStart.exec(rest)
  if (lead) {
    rest = rest.slice(lead[0].length).trimStart()
    symbols += 1
    takeSign()
  }
  const trail = symbolAtEnd.exec(rest)
  if (trail) {
    rest = rest.slice(0, rest.length - trail[0].length).trimEnd()
    symbols += 1
  }
  return symbols > 1 || signs > 1 ? null : { number: rest, negative }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const GROUP_MARK = /[.,\s\u00a0\u202f'\u2019]/
const sameMark = (
  a: string,
  b: string,
) => a.replace(/[\u00a0\u202f]/g, ' ') === b.replace(/[\u00a0\u202f]/g, ' ')

/** The digits of an integer part written with group marks, or null: one run of digits, or 1 to 3 then groups of 3 joined by one kind of mark. */
function wholeDigits(whole: string): string | null {
  const groups = whole.split(new RegExp(GROUP_MARK))
  if (groups.length === 1) return /^\d*$/.test(whole) ? whole : null
  const joiners = whole.match(new RegExp(GROUP_MARK, 'g')) ?? []
  const first = joiners[0] ?? ''
  const grouped = /^\d{1,3}$/.test(groups[0] ?? '') && groups.slice(1).every((g) => /^\d{3}$/.test(g))
  return grouped && joiners.every((j) => sameMark(j, first)) ? groups.join('') : null
}

/**
 * Cents from digits with group marks and at most one decimal mark, or null when the marks are not placed as a number
 * is written: the integer part is one run of digits, or 1 to 3 digits then groups of exactly 3 joined by one kind of
 * mark (a point, comma, space or apostrophe); the decimal mark, picked as `parseMoneyToCents` picks it, comes once.
 */
export function centsFromNumber(
  number: string,
  format: MoneyFormat,
): number | null {
  if (!/^[\d.,\s\u00a0\u202f'\u2019]+$/.test(number)) return null
  const typed = number.replace(/^(\d+)[.,]$/, '$1')
  const mark = decimalMark(typed.replace(/[\s\u00a0\u202f]/g, ' '), format, true)
  const halves = typed.split(mark)
  const [whole = '', fraction = ''] = halves
  const digits = wholeDigits(whole)
  if (halves.length > 2 || digits === null || !/^\d*$/.test(fraction) || digits + fraction === '') return null
  return Math.round(Number(`${digits === '' ? '0' : digits}${fraction === '' ? '' : `.${fraction}`}`) * 100)
}

/**
 * Only one separator in the text, the one a format does not write its decimals with, and one or
 * two digits after it: "2500.75" in a comma format, "12,5" in a point format. That is a decimal
 * mark typed on a numeric keypad that has the other key; three digits ("1.500") is a thousands
 * mark as it always was.
 */
const LONE_POINT = /^[^.,]*\.\d{1,2}(?!\d)[^.,]*$/
const LONE_COMMA = /^[^.,]*,\d{1,2}(?!\d)[^.,]*$/

export function decimalMark(
  body: string,
  format: MoneyFormat,
  otherMayBeDecimal: boolean,
): string {
  // Both marks in one amount: the earlier is a group mark and the later the decimal one, whichever the format
  // writes its decimals with ("1,234.56" in a comma format is 1.234,56, not 1,23).
  if (otherMayBeDecimal && body.includes('.') && body.includes(','))
    return body.lastIndexOf('.') > body.lastIndexOf(',') ? '.' : ','
  if (otherMayBeDecimal) {
    if (format.decimalSeparator === ',' && LONE_POINT.test(body)) return '.'
    if (format.decimalSeparator === '.' && LONE_COMMA.test(body)) return ','
  }
  return format.decimalSeparator
}
