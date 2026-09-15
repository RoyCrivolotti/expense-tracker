import { formatCents, type MoneyFormat } from '../../../engine'

function withSymbol(body: string, format: MoneyFormat): string {
  return format.symbolPosition === 'prefix' ? `${format.symbol}${body}` : `${body} ${format.symbol}`
}

/** Compact money for dense chart axes/tooltips, e.g. 1.2M / 340k in the owner's currency. */
export function formatMoneyShort(cents: number, format: MoneyFormat): string {
  if (cents >= 1_000_000_00) return withSymbol(`${(cents / 1_000_000_00).toFixed(1)}M`, format)
  if (cents >= 1_000_00) return withSymbol(`${Math.round(cents / 1_000_00)}k`, format)
  return formatCents(cents, format)
}

export function formatSignedMoneyShort(cents: number, format: MoneyFormat): string {
  const abs = formatMoneyShort(Math.abs(cents), format)
  if (cents > 0) return `+${abs}`
  if (cents < 0) return `−${abs}`
  return abs
}


