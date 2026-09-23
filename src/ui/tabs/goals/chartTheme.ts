import { applySymbol, formatCents, type MoneyFormat } from '../../../engine'

/** Compact money for dense chart axes/tooltips, e.g. 1.2M / 340k in the owner's currency. */
export function formatMoneyShort(cents: number, format: MoneyFormat): string {
  // Infinity is larger than the millions threshold, so without this it took the
  // compact branch and rendered "InfinityM". formatCents already has the answer for
  // a non-finite amount, and an infinite FI target reaches here whenever a scenario's
  // withdrawal rate is zero.
  if (!Number.isFinite(cents)) return formatCents(cents, format)
  if (cents >= 1_000_000_00) return applySymbol(`${(cents / 1_000_000_00).toFixed(1)}M`, format)
  if (cents >= 1_000_00) return applySymbol(`${Math.round(cents / 1_000_00)}k`, format)
  return formatCents(cents, format)
}

/**
 * Axis variant of {@link formatMoneyShort}: shows as many decimals as it takes to tell
 * ticks `stepCents` apart. A year of a plan spans a few percent of the balance, and
 * "1.0M" five times down the axis says nothing.
 */
export function formatMoneyAxis(cents: number, format: MoneyFormat, stepCents: number): string {
  if (!Number.isFinite(cents)) return formatCents(cents, format)
  const decimalsFor = (unit: number, floor: number, cap: number) =>
    Math.min(cap, Math.max(floor, Math.ceil(-Math.log10(Math.max(stepCents, 1) / unit))))
  if (cents >= 1_000_000_00) {
    return applySymbol(`${(cents / 1_000_000_00).toFixed(decimalsFor(1_000_000_00, 1, 3))}M`, format)
  }
  if (cents >= 1_000_00) {
    return applySymbol(`${(cents / 1_000_00).toFixed(decimalsFor(1_000_00, 0, 2))}k`, format)
  }
  return formatCents(cents, format)
}

export function formatSignedMoneyShort(cents: number, format: MoneyFormat): string {
  const abs = formatMoneyShort(Math.abs(cents), format)
  if (cents > 0) return `+${abs}`
  if (cents < 0) return `−${abs}`
  return abs
}


