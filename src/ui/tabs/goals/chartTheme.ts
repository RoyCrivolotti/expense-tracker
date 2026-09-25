import { applySymbol, formatCents, type MoneyFormat } from '../../../engine'

/** The minus goes in front of the whole amount, symbol included, as `formatCents` puts it. */
function withSign(cents: number, compact: string): string {
  return cents < 0 ? `-${compact}` : compact
}

/** Compact money for dense chart axes/tooltips, e.g. 1.2M / 340k in the owner's currency. */
export function formatMoneyShort(cents: number, format: MoneyFormat): string {
  // Infinity is larger than the millions threshold, so without this it took the
  // compact branch and rendered "InfinityM". formatCents already has the answer for
  // a non-finite amount, and an infinite FI target reaches here whenever a scenario's
  // withdrawal rate is zero.
  if (!Number.isFinite(cents)) return formatCents(cents, format)
  // By size, not by sign: a negative amount used to skip the compact forms and print in full,
  // which is wider than the axis' margin, so a tick such as -5M lost the start of its label.
  const abs = Math.abs(cents)
  if (abs >= 1_000_000_00) return withSign(cents, applySymbol(`${(abs / 1_000_000_00).toFixed(1)}M`, format))
  if (abs >= 1_000_00) return withSign(cents, applySymbol(`${Math.round(abs / 1_000_00)}k`, format))
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
  const abs = Math.abs(cents)
  if (abs >= 1_000_000_00) {
    return withSign(cents, applySymbol(`${(abs / 1_000_000_00).toFixed(decimalsFor(1_000_000_00, 1, 3))}M`, format))
  }
  if (abs >= 1_000_00) {
    return withSign(cents, applySymbol(`${(abs / 1_000_00).toFixed(decimalsFor(1_000_00, 0, 2))}k`, format))
  }
  return formatCents(cents, format)
}

export function formatSignedMoneyShort(cents: number, format: MoneyFormat): string {
  const abs = formatMoneyShort(Math.abs(cents), format)
  if (cents > 0) return `+${abs}`
  if (cents < 0) return `−${abs}`
  return abs
}


