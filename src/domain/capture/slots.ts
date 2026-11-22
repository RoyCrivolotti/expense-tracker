import { gluedMarker, splitNumberToken, standaloneMarker } from './currency'
import type { Marker, NumberToken } from './currency'
import { tokenise } from './shape'
import { trimEdges } from './text'
import type { DecimalMark } from './types'

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

export interface NumberSlot {
  kind: 'number'
  /** Position in `tokenise` of the text read. */
  index: number
  /** The token as written, punctuation and all. */
  raw: string
  /** Empty when the digits cannot be money: too large, too many decimals, a grouping that is not one. */
  candidates: Candidate[]
  /** ISO code of a marker glued to the number or standing next to it. */
  currency: string | null
  /** Present and true when the marker is a symbol several currencies share (`$`, `kr`), so `currency` is a guess to confirm. */
  currencyGuess?: true
  /** A minus before the number. A cue for direction only; the amount is never signed. */
  negative: boolean
}

export interface MaskedDigitsSlot {
  kind: 'masked-digits'
  index: number
  digits: string
}

export interface DateSlot {
  kind: 'date'
  index: number
  /** `YYYY-MM-DD`. */
  iso: string
  /** Present and true when day and month are both 12 or less and differ: read day first, but month first was possible. */
  ambiguous?: true
}

/** A bare run of 4 to 8 digits that is not an amount: a one-time code looks like this. */
export interface CodeSlot {
  kind: 'code'
  index: number
}

export type Slot = NumberSlot | MaskedDigitsSlot | DateSlot | CodeSlot

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

const MASK = '[*•·…●∙]'
const MASKED_FOUR = new RegExp(`^(?:${MASK}+|\\.{3,})(\\d{4})$`)
const MASK_ONLY = new RegExp(`^${MASK}+$`)
const FOUR_DIGITS = /^\d{4}$/

// `ending 1234` is the one worded form text.ts already reads; the mask characters need no word.
function readMasked(
  token: string,
  previous: string | undefined,
): string | null {
  const direct = MASKED_FOUR.exec(token)?.[1]
  if (direct) return direct
  if (!FOUR_DIGITS.test(token) || previous === undefined) return null
  const before = trimEdges(previous)
  return MASK_ONLY.test(before) || before.toLowerCase() === 'ending' ? token : null
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_FIRST_DATE = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})$/

function validDate(
  year: number,
  month: number,
  day: number,
): string | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) return null
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * `2026-11-20`, `20/11/2026`, `20-11-2026` and `20.11.2026`, the last three day first. No month names. When
 * the first two numbers are both 12 or less and differ (`03/04/2026`), the date is read day first and
 * flagged ambiguous, since a writer who puts the month first would mean another day.
 */
function readDate(
  index: number,
  token: string,
): DateSlot | null {
  const iso = ISO_DATE.exec(token)
  if (iso) {
    const date = validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
    return date ? { kind: 'date', index, iso: date } : null
  }
  const dayFirst = DAY_FIRST_DATE.exec(token)
  if (!dayFirst) return null
  const [day, month] = [Number(dayFirst[1]), Number(dayFirst[3])]
  const date = validDate(Number(dayFirst[4]), month, day)
  if (!date) return null
  return day <= 12 && month <= 12 && day !== month
    ? { kind: 'date', index, iso: date, ambiguous: true }
    : { kind: 'date', index, iso: date }
}

const MINUS = new Set(['-', '−'])

function isPlainNumber(token: string | undefined): boolean {
  const parts = token === undefined ? null : splitNumberToken(token)
  return parts !== null && !parts.prefix && !parts.suffix
}

/**
 * The number a standalone marker belongs to: the plain number right before it, else the one right after.
 * A marker is claimed once, so `12,50 EUR 3 items` leaves the 3 with no currency.
 */
function claimant(
  tokens: readonly string[],
  markerIndex: number,
): number | null {
  if (isPlainNumber(tokens[markerIndex - 1])) return markerIndex - 1
  return isPlainNumber(tokens[markerIndex + 1]) ? markerIndex + 1 : null
}

/** The standalone marker this number has claimed, looking before it first. */
function neighbourMarker(
  tokens: readonly string[],
  index: number,
): Marker | null {
  for (const at of [index - 1, index + 1]) {
    const marker = standaloneMarker(tokens[at] ?? '')
    if (marker && claimant(tokens, at) === index) return marker
  }
  return null
}

/** Four to eight bare digits, with no sign and no currency anywhere near, are a code and not an amount. */
function looksLikeCode(
  parts: NumberToken,
  currency: string | null,
): boolean {
  return currency === null && !parts.negative && !parts.prefix && !parts.suffix && /^\d{4,8}$/.test(parts.core)
}

function numberSlot(
  tokens: readonly string[],
  index: number,
  parts: NumberToken,
  marker: Marker | null,
): NumberSlot {
  const negative = parts.negative || MINUS.has(tokens[index - 1] ?? '')
  const slot: NumberSlot = {
    kind: 'number',
    index,
    raw: tokens[index] ?? '',
    candidates: readNumber(parts.core),
    currency: marker?.code ?? null,
    negative,
  }
  return marker?.guess ? { ...slot, currencyGuess: true } : slot
}

function readNumeric(
  tokens: readonly string[],
  index: number,
): Slot | null {
  const parts = splitNumberToken(tokens[index] ?? '')
  if (!parts) return null
  const glued = gluedMarker(parts)
  if ((parts.prefix || parts.suffix) && !glued) return null
  const marker = glued ?? neighbourMarker(tokens, index)
  return looksLikeCode(parts, marker?.code ?? null) ? { kind: 'code', index } : numberSlot(tokens, index, parts, marker)
}

function readToken(
  tokens: readonly string[],
  index: number,
): Slot | null {
  const trimmed = trimEdges(tokens[index] ?? '')
  const digits = readMasked(trimmed, tokens[index - 1])
  if (digits) return { kind: 'masked-digits', index, digits }
  return readDate(index, trimmed) ?? readNumeric(tokens, index)
}

/**
 * Finds the slots in a text: the numbers with their readings and currency, the masked card digits, the
 * dates and the bare codes. Every other token is left for the shape to keep as it is. `index` counts the
 * tokens of `tokenise(text)`, so the title and body of a push are read as `${title} ${body}`.
 */
export function readSlots(text: string): Slot[] {
  const tokens = tokenise(text)
  return tokens.flatMap((_token, index) => readToken(tokens, index) ?? [])
}

/** Convenience for a whole push: the slots of its title and body, indexed the way `skeletonOf` expects. */
export function readPushSlots(
  title: string,
  body: string,
): Slot[] {
  return readSlots(`${title} ${body}`)
}

/**
 * The amount of a push: the number slot that carries a currency marker. Several marked numbers that read
 * the same cents are one amount (the first); ones that differ are no amount at all, because guessing which
 * is the charge and which a balance would be wrong half the time.
 */
export function currencyAmount(slots: readonly Slot[]): NumberSlot | null {
  const marked = slots.filter((s): s is NumberSlot => s.kind === 'number' && s.currency !== null)
  const [first] = marked
  if (!first) return null
  if (marked.length === 1) return first
  const cents = first.candidates[0]?.cents
  return cents !== undefined && marked.every((s) => s.candidates[0]?.cents === cents) ? first : null
}
