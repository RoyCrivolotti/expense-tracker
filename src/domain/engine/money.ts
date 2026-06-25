/**
 * Money helpers. All amounts are stored as integer cents to avoid floating
 * point drift; parsing/formatting bridges to the EU-formatted strings used in
 * the source workbook ("1.456,60 €") and to display strings.
 */

/**
 * Parse an EU-formatted currency string into integer cents. Handles "1.456,60 €",
 * "250000", "0,85", "-639,06", and bare integers. Returns 0 for empty input.
 */
export function parseEuroToCents(raw: string): number {
  const cleaned = raw
    .replace(/€/g, '')
    .replace(/\s/g, '')
    .replace(/\u00a0/g, '')
    .trim()
  if (cleaned === '') return 0

  const negative = cleaned.startsWith('-')
  const digits = negative ? cleaned.slice(1) : cleaned

  // EU format: '.' groups thousands, ',' is the decimal separator.
  const normalized = digits.replace(/\./g, '').replace(',', '.')
  const value = Number(normalized)
  if (Number.isNaN(value)) return 0

  const cents = Math.round(value * 100)
  return negative ? -cents : cents
}

/** Parse a percentage like "40,0%" or "9,2%" into a fraction (0.40, 0.092). */
export function parsePercentToFraction(raw: string): number {
  const cleaned = raw.replace(/%/g, '').replace(/\s/g, '').replace(',', '.').trim()
  if (cleaned === '') return 0
  const value = Number(cleaned)
  return Number.isNaN(value) ? 0 : value / 100
}

/** Format a fraction as a EU percentage string, e.g. 0.05 -> "5,0%". */
export function formatPercent(fraction: number, decimals = 1): string {
  const pct = fraction * 100
  return `${pct.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`
}

/** EU euros string for editable text inputs, e.g. 110 -> "1,10". */
export function formatEuroInput(cents: number): string {
  return formatCents(cents, false)
}

/** Format integer cents as a euro string, e.g. 145660 -> "1.456,60 €". */
export function formatCents(cents: number, withSymbol = true): string {
  const negative = cents < 0
  const abs = Math.abs(cents)
  const euros = Math.floor(abs / 100)
  const remainder = (abs % 100).toString().padStart(2, '0')
  const grouped = euros.toLocaleString('de-DE')
  const sign = negative ? '-' : ''
  const body = `${sign}${grouped},${remainder}`
  return withSymbol ? `${body} €` : body
}

/** Compact display, e.g. 145660 -> "1.457 €" (no decimals), for dense charts. */
export function formatCentsCompact(cents: number): string {
  const euros = Math.round(cents / 100)
  return `${euros.toLocaleString('de-DE')} €`
}
