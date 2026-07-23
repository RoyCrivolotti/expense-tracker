/**
 * Money helpers. All amounts are stored as integer cents to avoid floating
 * point drift; parsing/formatting bridges to human strings in the user's chosen
 * currency and number format. The default is the original EU convention
 * ("1.456,60 €") so callers that pass no format keep the historical behavior.
 */

/** ISO 4217 currency code used when a user has no explicit preference. */
export const DEFAULT_CURRENCY_CODE = 'EUR'
/** BCP-47 number locale used when a user has no explicit preference. */
export const DEFAULT_NUMBER_LOCALE = 'de-DE'

/**
 * Resolved formatting rules for one currency + locale. Derived once from a
 * currency code and locale (see `resolveMoneyFormat`) and threaded explicitly so
 * the domain stays pure and the UI can swap it per user.
 */
export interface MoneyFormat {
  /** Locale used for digit grouping (thousands separators). */
  locale: string
  /** Currency glyph, e.g. '€', '$', '£'. */
  symbol: string
  /** Whether the symbol sits before or after the number. */
  symbolPosition: 'prefix' | 'suffix'
  /** Decimal separator, e.g. ',' (EU) or '.' (US). */
  decimalSeparator: string
}

/** The original euros/de-DE convention; used as the default for every helper. */
export const EU_MONEY_FORMAT: MoneyFormat = {
  locale: 'de-DE',
  symbol: '€',
  symbolPosition: 'suffix',
  decimalSeparator: ',',
}

/**
 * Derive symbol, position, and decimal separator from an ISO currency code and
 * locale using Intl. Grouping still goes through `toLocaleString(locale)` at
 * format time so the separators stay locale-correct. Falls back to the EU
 * convention if the runtime rejects the code/locale.
 */
export function resolveMoneyFormat(
  currencyCode: string = DEFAULT_CURRENCY_CODE,
  locale: string = DEFAULT_NUMBER_LOCALE,
): MoneyFormat {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
    }).formatToParts(-1111.11)
    let symbol = currencyCode
    let decimalSeparator = '.'
    let symbolPosition: 'prefix' | 'suffix' = 'prefix'
    let seenDigit = false
    for (const part of parts) {
      if (part.type === 'currency') {
        symbol = part.value
        symbolPosition = seenDigit ? 'suffix' : 'prefix'
      } else if (part.type === 'decimal') {
        decimalSeparator = part.value
      } else if (part.type === 'integer' || part.type === 'fraction') {
        seenDigit = true
      }
    }
    return { locale, symbol, symbolPosition, decimalSeparator }
  } catch {
    return EU_MONEY_FORMAT
  }
}

/**
 * Parse a human currency string into integer cents. Group separators and the
 * currency symbol are stripped; only the format's decimal separator is honored.
 * Handles "1.456,60 €", "$1,456.60", "250000", "0,85", "-639,06". Bare integers
 * are treated as whole units. Returns 0 for empty/unparseable input.
 */
export function parseMoneyToCents(raw: string, format: MoneyFormat = EU_MONEY_FORMAT): number {
  const stripped = raw.replace(/[\s\u00a0]/g, '')
  if (stripped === '') return 0
  const negative = stripped.startsWith('-')
  const body = negative ? stripped.slice(1) : stripped
  let normalized = ''
  for (const ch of body) {
    if (ch >= '0' && ch <= '9') normalized += ch
    else if (ch === format.decimalSeparator) normalized += '.'
    // group separators, currency symbols, and stray chars are dropped
  }
  const value = Number(normalized)
  if (normalized === '' || Number.isNaN(value)) return 0
  const cents = Math.round(value * 100)
  return negative ? -cents : cents
}

/** Parse a percentage like "40,0%" or "9.2%" into a fraction (0.40, 0.092). */
export function parsePercentToFraction(
  raw: string,
  format: MoneyFormat = EU_MONEY_FORMAT,
): number {
  const cleaned = raw
    .replace(/%/g, '')
    .replace(/[\s\u00a0]/g, '')
    .replace(format.decimalSeparator, '.')
    .trim()
  if (cleaned === '') return 0
  const value = Number(cleaned)
  return Number.isNaN(value) ? 0 : value / 100
}

/** Format a fraction as a localized percentage string, e.g. 0.05 -> "5,0%". */
export function formatPercent(
  fraction: number,
  format: MoneyFormat = EU_MONEY_FORMAT,
  decimals = 1,
): string {
  const pct = fraction * 100
  return `${pct.toLocaleString(format.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`
}

/** Localized string for editable percent inputs (no '%' sign), e.g. 0.05 -> "5,0". */
export function formatPercentInput(
  fraction: number,
  format: MoneyFormat = EU_MONEY_FORMAT,
  decimals = 1,
): string {
  return (fraction * 100).toFixed(decimals).replace('.', format.decimalSeparator)
}

function applySymbol(body: string, format: MoneyFormat): string {
  return format.symbolPosition === 'prefix' ? `${format.symbol}${body}` : `${body} ${format.symbol}`
}

/** Localized string for editable money inputs (no symbol), e.g. 110 -> "1,10". */
export function formatMoneyInput(cents: number, format: MoneyFormat = EU_MONEY_FORMAT): string {
  return formatCents(cents, format, false)
}

/** Format integer cents as a currency string, e.g. 145660 -> "1.456,60 €". */
export function formatCents(
  cents: number,
  format: MoneyFormat = EU_MONEY_FORMAT,
  withSymbol = true,
): string {
  const negative = cents < 0
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100)
  const remainder = (abs % 100).toString().padStart(2, '0')
  const grouped = whole.toLocaleString(format.locale)
  const body = `${grouped}${format.decimalSeparator}${remainder}`
  const withSym = withSymbol ? applySymbol(body, format) : body
  return negative ? `-${withSym}` : withSym
}

/** Compact display, e.g. 145660 -> "1.457 €" (no decimals), for dense charts. */
export function formatCentsCompact(cents: number, format: MoneyFormat = EU_MONEY_FORMAT): string {
  const negative = cents < 0
  const whole = Math.round(Math.abs(cents) / 100)
  const body = applySymbol(whole.toLocaleString(format.locale), format)
  return negative ? `-${body}` : body
}

/**
 * @deprecated Use `parseMoneyToCents`. Retained for EU-only import/seed paths.
 */
export function parseEuroToCents(raw: string): number {
  return parseMoneyToCents(raw, EU_MONEY_FORMAT)
}

/**
 * @deprecated Use `formatMoneyInput`. Retained for EU-only import/seed paths.
 */
export function formatEuroInput(cents: number): string {
  return formatMoneyInput(cents, EU_MONEY_FORMAT)
}
