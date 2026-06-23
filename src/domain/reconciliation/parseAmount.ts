import { parseEuroToCents } from '../engine/money'

function parseUsThousands(digits: string, negative: boolean): number {
  const value = Number(digits.replace(/,/g, ''))
  if (Number.isNaN(value)) return 0
  const cents = Math.round(value * 100)
  return negative ? -cents : cents
}

function parseDotDecimal(digits: string, negative: boolean): number {
  const value = Number(digits)
  if (Number.isNaN(value)) return 0
  const cents = Math.round(value * 100)
  return negative ? -cents : cents
}

/** Parse bank amount strings (EU and mixed US thousands). Returns signed cents. */
export function parseBankAmountCents(raw: string): number {
  const cleaned = raw.replace(/€/g, '').replace(/\s/g, '').replace(/\u00a0/g, '').trim()
  if (cleaned === '') return 0

  const negative = cleaned.startsWith('-')
  const digits = negative ? cleaned.slice(1) : cleaned

  if (digits.includes(',') && digits.includes('.')) {
    const lastComma = digits.lastIndexOf(',')
    const lastDot = digits.lastIndexOf('.')
    if (lastDot > lastComma) return parseUsThousands(digits, negative)
    return parseEuroToCents(negative ? `-${digits}` : digits)
  }

  if (digits.includes(',')) {
    return parseEuroToCents(negative ? `-${digits}` : digits)
  }

  return parseDotDecimal(digits, negative)
}
