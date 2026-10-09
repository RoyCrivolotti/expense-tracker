import { fiTargetsCents, formatPercent } from '../../../../engine'
import type { MoneyFormat } from '../../../../engine/money'

/** What the same spending needs saved up at 4%, 3,5% and 3%, in a sentence; null when there is no spending to cover. */
export function fiTargetsLine(
  annualSpendCents: number,
  money: (cents: number) => string,
  format: MoneyFormat,
): string | null {
  if (annualSpendCents <= 0) return null
  const [a, b, c] = fiTargetsCents(annualSpendCents).map((t) => `${money(t.targetCents)} at ${formatPercent(t.rate, format)}`)
  return `The same spending needs ${a}, ${b} or ${c}.`
}
