import { findAmountAnyMark } from './amount'
import type { ParsedAmount } from './amount'
import { cleanText, foldTitle } from './text'
import type { PushKind } from './types'

/**
 * What a push says when no bank-specific rule matches it. A new bank works with no code: a push is kept when it carries
 * exactly one amount marked as euros and is not an advertisement, and the words around the amount only guess which way
 * the money moved. Nothing here creates an expense. Every result is a recommendation the person reviews, so a wrong
 * guess costs a tap on "Don't add" and a missed push costs a payment typed by hand.
 *
 * The words are Spanish, as are today's banks. Another language adds words to the lists below and changes nothing else.
 * They are compared folded (no case, no accents), as whole words.
 */

/** An advertisement, an offer, a release or a cancellation: not a payment that happened. */
const NOISE = /\b(oferta|ofertas|promocion|promociones|descuento|descuentos|sorteo|financia|financiacion|fracciona|fraccionar|preconcedid[oa]s?|prestamo|liberad[oa]|anulad[oa]|anulacion|cancelad[oa])\b/
/** A balance alert has an amount and no payment. Only noise when no word below says money moved. */
const BALANCE = /\b(saldo)\b/

/** The money will leave on a day the push names, which may be ahead. */
const SCHEDULED = /\b(se cargara|se adeudara|se domiciliara|se pasara|se debitara|cargaremos|adeudaremos|proximo cargo|vencimiento)\b/
/** A card hold: the bank has set the amount aside and will settle it later. */
const HOLD = /\b(retencion|retenido|preautorizacion)\b/
const REFUND = /\b(devolucion|reembolso)\b/
const INCOME = /\b(ingreso|ingresado|ingresan|abono|abonado|has recibido|te han (?:enviado|ingresado|transferido)|transferencia recibida|bizum recibido|nomina)\b/
const PURCHASE = /\b(compra|pago|dispuesto)\b/
/** A push that moves money between people names one of them, so its text is never kept. */
const NAMES_A_PERSON = /\b(bizum|transferencia|has enviado|te han enviado|has recibido)\b/
const CHARGE = /\b(cargo|cargado|recibo|adeudo|domiciliacion|retirada|has enviado|transferencia enviada)\b/

/** The kind the words suggest, or null when none of them is there. Earlier lines win: a scheduled receipt is also a charge. */
function kindFromWords(text: string): PushKind | null {
  if (SCHEDULED.test(text)) return 'scheduled-charge'
  if (HOLD.test(text)) return 'card-hold'
  if (REFUND.test(text)) return 'refund'
  if (INCOME.test(text)) return 'inflow'
  if (PURCHASE.test(text)) return 'card-purchase'
  if (CHARGE.test(text)) return 'charge'
  return null
}

export type GenericReading =
  | { outcome: 'read'; kind: PushKind; amount: ParsedAmount; text: string; merchant: string | null; dueDate: string | null; keepsText: boolean }
  | { outcome: 'drop'; reason: 'promotional' | 'no-amount' }

/** A merchant is a short run of words that does not start like a sentence ("tu cuenta", "la tarjeta"). */
const NOT_A_MERCHANT = /^(tu|tus|su|sus|la|el|los|las|un|una|este|esta|ese|esa|mi|nuestra|nuestro)\b/i
// Each pattern names the merchant the way a bank sentence does. They are tried in order, and none matching is fine: the
// person then sees the bank's whole text and picks the description.
const MERCHANT_PATTERNS: readonly RegExp[] = [
  /\bemitido por ([^,.*]+?)(?=,| en tu\b| en su\b| con cargo\b|\.|$)/i,
  /\b(?:compra|pago|retencion|retención|cargo)\b.*?\ben ([^,.*\d]+?)(?= con (?:tu|su|la|el)\b| con \*| por\b|,|\.| el \d|$)/i,
]

/** The merchant a bank sentence names, as written, or null. */
export function findMerchant(text: string): string | null {
  for (const pattern of MERCHANT_PATTERNS) {
    const found = pattern.exec(text)?.[1]?.trim()
    if (found && found.length <= 80 && !NOT_A_MERCHANT.test(found)) return found
  }
  return null
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const ISO_DAY = /\b(\d{4})-(\d{2})-(\d{2})\b/
const DMY = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/
const WORDS_DAY = new RegExp(`\\b(\\d{1,2}) de (${MONTHS.join('|')})(?: de (\\d{4}))?\\b`)

const pad = (n: number) => String(n).padStart(2, '0')
const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000

/** `YYYY-MM-DD` when the three numbers are a real calendar day, else null. */
function realDay(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? `${year}-${pad(month)}-${pad(day)}` : null
}

/** The day a scheduled charge names, written as `2026-11-16`, `16/11/2026` or `16 de noviembre`; a year left out is the next one. */
export function findDueDay(folded: string, pushDay: string): string | null {
  const iso = ISO_DAY.exec(folded)
  if (iso) return realDay(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const dmy = DMY.exec(folded)
  if (dmy) return realDay(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))
  const words = WORDS_DAY.exec(folded)
  if (!words) return null
  const month = MONTHS.indexOf(words[2] ?? '') + 1
  const pushYear = Number(pushDay.slice(0, 4))
  if (words[3]) return realDay(Number(words[3]), month, Number(words[1]))
  const thisYear = realDay(pushYear, month, Number(words[1]))
  return thisYear !== null && dayNumber(thisYear) >= dayNumber(pushDay) - 1 ? thisYear : realDay(pushYear + 1, month, Number(words[1]))
}

/** How far ahead of the push a named day is believed. A date further out is more likely a contract term than a charge. */
const MAX_DAYS_AHEAD = 60

/**
 * Reads a push no rule covers. `pushDay` is the phone's calendar day, which anchors a due date. Returns a drop with the
 * reason, or what was read. The cleaned body is returned so the caller can keep it.
 */
export function readGeneric(title: string, body: string, pushDay: string): GenericReading {
  const text = cleanText(body)
  const folded = foldTitle(`${title} ${body}`)
  if (NOISE.test(folded)) return { outcome: 'drop', reason: 'promotional' }
  const amount = findAmountAnyMark(text)
  if (!amount) return { outcome: 'drop', reason: 'no-amount' }
  const kind = kindFromWords(folded)
  if (kind === null && BALANCE.test(folded)) return { outcome: 'drop', reason: 'no-amount' }
  let dueDate: string | null = null
  if (kind === 'scheduled-charge') {
    const named = findDueDay(folded, pushDay)
    if (named !== null && dayNumber(named) >= dayNumber(pushDay) - 1 && dayNumber(named) <= dayNumber(pushDay) + MAX_DAYS_AHEAD) dueDate = named
  }
  const resolved = kind ?? 'unclassified'
  const keepsText = resolved !== 'inflow' && !NAMES_A_PERSON.test(folded)
  return { outcome: 'read', kind: resolved, amount, text, merchant: keepsText ? findMerchant(text) : null, dueDate, keepsText }
}
