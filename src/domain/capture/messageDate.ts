import { isMarkerToken } from './currency'
import { foldTitle, trimEdges } from './text'

/**
 * The date a bank writes into a push, when it names the day the money moves: a direct debit announced the evening
 * before ("on 24/11/2026 the bill of 47,15 EUR will be charged"), or a payment reported late. Read for any bank and
 * any wording, from the date alone: no template knows where it sits.
 *
 * This reader is apart from the slots on purpose. A slot changes the skeleton a push is learned under, so reading
 * more kinds of date there would give every push that holds one a new skeleton and lose what it taught.
 */

/**
 * How far from the day the push arrived a date in it may be and still be the payment's.
 *
 * Back 7 days: the Worker refuses a push older than `MAX_PUSH_AGE_MS`, a week, so a phone that held a notification
 * back reports a payment at most that old. Forward 10 days: banks announce a direct debit a day or a few ahead, and a
 * payment dated further out would sit on the list for weeks. Outside the window a date is something else (a statement
 * period, a card's expiry, a due date months away) and the arrival day is kept.
 */
export const MESSAGE_DATE_WINDOW = { daysBack: 7, daysForward: 10 } as const

const MONTHS: ReadonlyMap<string, number> = new Map(
  [
    ['jan', 'january', 'ene', 'enero'],
    ['feb', 'february', 'febrero'],
    ['mar', 'march', 'marzo'],
    ['apr', 'april', 'abr', 'abril'],
    ['may', 'mayo'],
    ['jun', 'june', 'junio'],
    ['jul', 'july', 'julio'],
    ['aug', 'august', 'ago', 'agosto'],
    ['sep', 'sept', 'september', 'septiembre', 'setiembre'],
    ['oct', 'october', 'octubre'],
    ['nov', 'november', 'noviembre'],
    ['dec', 'december', 'dic', 'diciembre'],
  ].flatMap((names, month) => names.map((name) => [name, month + 1] as const)),
)

/**
 * Words that put a date before them as a limit rather than the payment's day: an offer valid until, a card that
 * expires. A push with such a date keeps its arrival day, whatever other date it names.
 */
const LIMIT_WORDS: ReadonlySet<string> = new Set([
  'until',
  'till',
  'before',
  'expires',
  'expiry',
  'valid',
  'hasta',
  'antes',
  'valido',
  'valida',
  'caduca',
  'caducidad',
  // A due date is the last day to pay, not the day the money moved: a card statement's "fecha límite de pago".
  'vence',
  'vencimiento',
  'limite',
])

/** Words that join the two days of a range: `entre el 24 y el 28`, `del 24 al 28`, `from 24 to 28`. */
const RANGE_JOINERS: ReadonlySet<string> = new Set(['y', 'al', 'a', 'and', 'to', '-', '–'])

/**
 * Words before a `d/m` that make it a count rather than a day: `Cuota 2/12` is the second of twelve instalments.
 * `24/7` is an opening hours sign whatever comes before it.
 */
const FRACTION_WORDS: ReadonlySet<string> = new Set([
  'cuota',
  'cuotas',
  'plazo',
  'plazos',
  'mensualidad',
  'instalment',
  'installment',
  'instalments',
  'installments',
])
const ROUND_THE_CLOCK = '24/7'

/** Year first: `2026-11-24`, `2026/11/24`, `2026.11.24`. */
const YEAR_FIRST = /^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})$/
/** Day and month, then a year of two or four digits: `24/11/2026`, `24-11-26`, `24.11.2026`. */
const WITH_YEAR = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{2}|\d{4})$/
/** Day and month with no year, slash only: `24/11`. A dot or a dash is too often an amount or a reference. */
const NO_YEAR = /^(\d{1,2})\/(\d{1,2})$/
/** One word with a month name: `24-nov-2026`, `24-nov`, `24.nov.26`. */
const NAMED_WORD = /^(\d{1,2})([-.])(\p{L}+)(?:\2(\d{2}|\d{4}))?$/u
const DAY = /^(\d{1,2})(?:st|nd|rd|th|º|°)?$/
const YEAR = /^(\d{4})$/

/** A date found in the text: every reading it allows, and the token it starts at. */
interface Found {
  start: number
  readings: string[]
}

function isoOf(
  year: number,
  month: number,
  day: number,
): string | null {
  if (month < 1 || month > 12 || day < 1) return null
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000

/** Days from `from` to `to`, negative when `to` is earlier. */
const daysBetween = (
  from: string,
  to: string,
) => Math.round(dayNumber(to) - dayNumber(from))

const fullYear = (written: string) => (written.length === 2 ? 2000 + Number(written) : Number(written))

/** A day and month with no year: the year that puts it nearest the arrival, or none when no year makes it a real day. */
function nearestYear(
  month: number,
  day: number,
  arrival: string,
): string[] {
  const year = Number(arrival.slice(0, 4))
  const dates = [year - 1, year, year + 1].flatMap((y) => isoOf(y, month, day) ?? [])
  const nearest = dates.sort((a, b) => Math.abs(daysBetween(arrival, a)) - Math.abs(daysBetween(arrival, b)))[0]
  return nearest === undefined ? [] : [nearest]
}

/** Both orders of a numeric day and month, when the year is written: the ones that are real days. */
function bothOrders(
  first: number,
  second: number,
  year: number,
): string[] {
  return [...new Set([isoOf(year, second, first), isoOf(year, first, second)].flatMap((d) => d ?? []))]
}

/** A date written as one word, numbers only or with a month name. */
function oneWord(
  token: string,
  arrival: string,
  fraction: boolean,
): string[] | null {
  const yearFirst = YEAR_FIRST.exec(token)
  if (yearFirst)
    return [isoOf(Number(yearFirst[1]), Number(yearFirst[3]), Number(yearFirst[4]))].flatMap((d) => d ?? [])
  const withYear = WITH_YEAR.exec(token)
  if (withYear) return bothOrders(Number(withYear[1]), Number(withYear[3]), fullYear(withYear[4] ?? ''))
  // Day first only: month first would read a card's expiry (`11/26`) as a day.
  const noYear = NO_YEAR.exec(token)
  if (noYear)
    return fraction || token === ROUND_THE_CLOCK ? null : nearestYear(Number(noYear[2]), Number(noYear[1]), arrival)
  const named = NAMED_WORD.exec(foldTitle(token))
  const month = named ? MONTHS.get(named[3] ?? '') : undefined
  if (!named || month === undefined) return null
  const day = Number(named[1])
  if (named[4] === undefined) return nearestYear(month, day, arrival)
  return [isoOf(fullYear(named[4]), month, day)].flatMap((d) => d ?? [])
}

const word = (
  tokens: readonly string[],
  at: number,
) => foldTitle(trimEdges(tokens[at] ?? ''))
const dayAt = (
  tokens: readonly string[],
  at: number,
) => {
  const m = DAY.exec(word(tokens, at))
  return m ? Number(m[1]) : null
}
const yearAt = (
  tokens: readonly string[],
  at: number,
) => {
  const m = YEAR.exec(word(tokens, at))
  return m ? Number(m[1]) : null
}

/** A day and month, with the year written or the one nearest the arrival. */
const readingsOf = (
  month: number,
  day: number,
  year: number | null,
  arrival: string,
) => (year === null ? nearestYear(month, day, arrival) : [isoOf(year, month, day)].flatMap((d) => d ?? []))

/**
 * A date written over several words around a month name: `24 Nov`, `24 de noviembre de 2026`, `Nov 24, 2026`,
 * `November 24th`. The day must stand next to the month (or one `de` away), so the English "may" on its own is a word.
 */
function spread(
  tokens: readonly string[],
  at: number,
  arrival: string,
): Found | null {
  const month = MONTHS.get(word(tokens, at))
  if (month === undefined) return null
  const linked = word(tokens, at - 1) === 'de' ? at - 2 : at - 1
  const before = dayAt(tokens, linked)
  // A number after the month that a currency follows is an amount: `November 12 EUR`.
  const after = isMarkerToken(tokens[at + 2] ?? '') ? null : dayAt(tokens, at + 1)
  const day = before ?? after
  if (day === null) return null
  // `entre el 24 y el 28 de noviembre` names two days. Read as its last day alone, a range would date the payment.
  if (before !== null && rangeBefore(tokens, linked)) return { start: linked, readings: [] }
  const yearFrom = before === null ? at + 2 : word(tokens, at + 1) === 'de' ? at + 2 : at + 1
  const year = yearAt(tokens, yearFrom)
  return { start: before === null ? at : linked, readings: readingsOf(month, day, year, arrival) }
}

/** Whether a bare day and a joining word come before the day at `at`, as in `del 24 al 28`. */
function rangeBefore(
  tokens: readonly string[],
  at: number,
): boolean {
  const joiner = word(tokens, at - 1) === 'el' ? at - 2 : at - 1
  return RANGE_JOINERS.has(word(tokens, joiner)) && dayAt(tokens, joiner - 1) !== null
}

/** Whether a fraction word stands one or two words before `at`: `Cuota 2/12`, `plazo nº 1/3`. */
const afterFractionWord = (
  tokens: readonly string[],
  at: number,
) => [at - 1, at - 2].some((before) => FRACTION_WORDS.has(word(tokens, before)))

function findDates(
  tokens: readonly string[],
  arrival: string,
): Found[] {
  return tokens.flatMap((token, at): Found[] => {
    const single = oneWord(trimEdges(token), arrival, afterFractionWord(tokens, at))
    if (single !== null) return [{ start: at, readings: single }]
    const found = spread(tokens, at, arrival)
    return found ? [found] : []
  })
}

/** Three words back, so `hasta el día 30/11` and `fecha límite de 30/11` both reach their limit word. */
const afterLimit = (
  tokens: readonly string[],
  start: number,
) => [start - 1, start - 2, start - 3].some((at) => LIMIT_WORDS.has(word(tokens, at)))

/**
 * The payment's date from the words of a push, or null to keep `arrival`, the phone's day the push came. A date is
 * used only when it is the one date the text names and it can be read one way: every date found must give exactly
 * one reading inside `MESSAGE_DATE_WINDOW` around `arrival`, and all of them the same day. A day and month that read
 * either way round (`03/04/2026`) count only when one order lands in the window. A date after a limit word (`valid
 * until`) leaves the arrival day. Times (`21:32`), amounts and runs of digits are not dates.
 */
export function messageDate(
  tokens: readonly string[],
  arrival: string,
): string | null {
  const found = findDates(tokens, arrival)
  if (found.length === 0 || found.some((f) => afterLimit(tokens, f.start))) return null
  const days = new Set<string>()
  for (const { readings } of found) {
    const inside = readings.filter((d) => {
      const gap = daysBetween(arrival, d)
      return gap >= -MESSAGE_DATE_WINDOW.daysBack && gap <= MESSAGE_DATE_WINDOW.daysForward
    })
    if (inside.length !== 1) return null
    days.add(inside[0]!)
  }
  return days.size === 1 ? [...days][0]! : null
}
