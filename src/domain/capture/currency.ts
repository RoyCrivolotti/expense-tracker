import { trimEdges } from './text'

/**
 * ISO 4217 codes still in use. A currency marker is a world standard and not a language, so it is the
 * one piece of outside knowledge the push reader holds.
 */
const ISO_CODES: ReadonlySet<string> = new Set(
  (
    'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF ' +
    'CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD ' +
    'HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD ' +
    'MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN ' +
    'PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY ' +
    'TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XOF XPF YER ZAR ZMW ZWL'
  ).split(' '),
)

/**
 * Codes that are also ordinary words in some language ("all", "try", "top", "ron" for rum). Written in
 * capitals they are a currency; in any other case they are not, or "all 5 items" would be money.
 */
const HOMOGRAPH_CODES: ReadonlySet<string> = new Set(
  'ALL ANG BAM BOB COP CUP DOP GEL GIP LAK MAD MOP NAD PAB PEN RON SAR SOS TOP TRY'.split(' '),
)

/**
 * Symbols and short written forms, lower case, with the code each most likely means. `$`, `¥` and `kr` are
 * shared by several currencies; the first is a guess and a person's own history is the way to correct it.
 */
const SYMBOLS: ReadonlyMap<string, string> = new Map(Object.entries({
  '€': 'EUR',
  $: 'USD',
  '£': 'GBP',
  '¥': 'JPY',
  '₹': 'INR',
  '₽': 'RUB',
  '₩': 'KRW',
  '₺': 'TRY',
  '₪': 'ILS',
  '₫': 'VND',
  '฿': 'THB',
  '₱': 'PHP',
  '₦': 'NGN',
  '₴': 'UAH',
  '₸': 'KZT',
  '₡': 'CRC',
  '₲': 'PYG',
  r$: 'BRL',
  us$: 'USD',
  a$: 'AUD',
  c$: 'CAD',
  nz$: 'NZD',
  hk$: 'HKD',
  s$: 'SGD',
  mx$: 'MXN',
  kr: 'SEK',
  zł: 'PLN',
  kč: 'CZK',
}))

/** Symbols several currencies share, so the code given for them is a guess to confirm, not a reading. */
const SHARED_SYMBOLS: ReadonlySet<string> = new Set(['$', '¥', 'kr'])

/** A token split around the number in it, `-€12,50` giving sign, prefix `€`, core `12,50` and no suffix. */
export interface NumberToken {
  negative: boolean
  prefix: string
  /** Digits with their separators, starting and ending on a digit. */
  core: string
  suffix: string
}

const NUMBER_TOKEN = /^([-−+])?([^\d\-−+]*?)([-−+])?(\d(?:[\d.,]*\d)?)([^\d]*)$/u

/** Splits a token with exactly one run of digits in it, or null when it has none or several. */
export function splitNumberToken(token: string): NumberToken | null {
  const match = NUMBER_TOKEN.exec(trimEdges(token))
  if (!match) return null
  const minus = (sign: string | undefined) => sign === '-' || sign === '−'
  return { negative: minus(match[1]) || minus(match[3]), prefix: match[2] ?? '', core: match[4] ?? '', suffix: match[5] ?? '' }
}

/** A currency marker read from text: the ISO code, and whether the marker leaves it a guess. */
export interface Marker {
  code: string
  guess: boolean
}

function exactMarker(text: string): Marker | null {
  const word = trimEdges(text).normalize('NFC')
  if (!word) return null
  const lower = word.toLowerCase()
  const symbol = SYMBOLS.get(lower)
  if (symbol) return { code: symbol, guess: SHARED_SYMBOLS.has(lower) }
  const code = word.toUpperCase()
  if (!/^[A-Za-z]{3}$/.test(word) || !ISO_CODES.has(code)) return null
  return word === code || !HOMOGRAPH_CODES.has(code) ? { code, guess: false } : null
}

/**
 * The marker in a token: the whole token (`EUR`, `€`, `r$`) or one glued to a number on either side
 * (`50,00EUR`, `€12`, `12€`). Case does not matter, except for the few codes that are also words (see
 * `HOMOGRAPH_CODES`).
 */
export function findMarker(token: string): Marker | null {
  const whole = exactMarker(token)
  if (whole) return whole
  const parts = splitNumberToken(token)
  return parts ? gluedMarker(parts) : null
}

/** The ISO code a currency marker stands for, or null when the token has none. */
export function currencyMarker(token: string): string | null {
  return findMarker(token)?.code ?? null
}

/**
 * The marker around a number, when each side that is not empty is one. `€12km` has none: the `km` says
 * the number is a distance, and a marker beside it does not make it money.
 */
export function gluedMarker(parts: NumberToken): Marker | null {
  const before = parts.prefix ? exactMarker(parts.prefix) : null
  const after = parts.suffix ? exactMarker(parts.suffix) : null
  if ((parts.prefix && !before) || (parts.suffix && !after)) return null
  return before ?? after
}

/** The marker of a token that is a currency marker and nothing else, or null for any other token. */
export function standaloneMarker(token: string): Marker | null {
  return /\d/.test(token) ? null : exactMarker(token)
}

/** True for a token that is a currency marker and nothing else. */
export function isMarkerToken(token: string): boolean {
  return standaloneMarker(token) !== null
}
