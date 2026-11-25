import { formatMoneyInput, tryParseDecimal } from '../../../../engine'
import type { MoneyFormat } from '../../../../engine'

/** Whole amounts without the cents, so a seven-figure balance fits a bar column. */
export function moneyText(
  cents: number,
  format: MoneyFormat,
): string {
  return cents % 100 === 0 ? Math.round(cents / 100).toLocaleString(format.locale) : formatMoneyInput(cents, format)
}

/** A typed percentage as a fraction, without the noise of dividing by 100 (1.1 / 100 is 0.011000000000000001). */
export function toFraction(percent: number): number {
  return Math.round(percent * 1e4) / 1e6
}

export function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * What was typed as a plain number, or null when it is not one. A comma or a point both mean
 * the decimal mark (a percentage or a year count has no thousands), and nothing typed is not zero.
 */
export function typedNumber(raw: string): number | null {
  return tryParseDecimal(raw.replace(/%\s*$/, ''))
}
