import { formatPercent, type RetirementOdds } from '../../../../engine'
import type { MoneyFormat } from '../../../../engine/money'

/** How many runs the chance is worked out from: the spread card's, so the two come from the same futures. */
export const ODDS_RUNS = 10_000

/** A share as a whole number out of 100, never 0 or 100 for a share that is not, so a risk is not rounded away. */
export function runsOfHundred(share: number): number {
  if (share <= 0) return 0
  if (share >= 1) return 100
  return Math.min(99, Math.max(1, Math.round(share * 100)))
}

/**
 * What the cut-off of the unluckiest tenth means: one run in ten lasts this many years or fewer, some of them fewer,
 * which is not the same as the whole worst tenth lasting this long.
 */
function lastsLine(years: number): string {
  if (years === 0) return 'the money runs out in the first year'
  return `it lasts ${years} ${years === 1 ? 'year' : 'years'} or less`
}

/** A withdrawal rate as it is usually said: one decimal, two for a quarter point such as 3,25%. */
function rateText(rate: number, format: MoneyFormat): string {
  const tenths = rate * 1000
  return formatPercent(rate, format, Math.abs(tenths - Math.round(tenths)) < 1e-9 ? 1 : 2)
}

/**
 * How often the money lasts, in a sentence: at the plan's own withdrawal rate first, with how long it lasts in the
 * worst tenth of runs when that is less than all of it, then the other usual rates. The first result is the plan's.
 * Null when there is nothing to say.
 */
export function retirementOddsLine({
  rate,
  years,
  realReturn,
  volatility,
  results,
  format,
}: {
  rate: number
  years: number
  realReturn: number
  volatility: number
  results: readonly { rate: number; odds: RetirementOdds }[]
  format: MoneyFormat
}): string | null {
  const [own, ...others] = results
  if (!own) return null
  const unit = years === 1 ? 'year' : 'years'
  const worst = own.odds.unluckiestTenth < years ? ` (in 10 of the 100 ${lastsLine(own.odds.unluckiestTenth)})` : ''
  const rest = others.map((r) => `${runsOfHundred(r.odds.lasts)} at ${rateText(r.rate, format)}`)
  const list = rest.length === 0 ? '' : rest.length === 1 ? `, ${rest[0]}` : `, ${rest.slice(0, -1).join(', ')} and ${rest[rest.length - 1]}`
  return (
    `Started at the target, with the spending taken out each year, the money lasts all ${years} ${unit} in ` +
    `${runsOfHundred(own.odds.lasts)} of 100 runs at your ${rateText(rate, format)}${worst}${list}. ` +
    `The typical return is ${formatPercent(realReturn, format)} a year with a bounce of ${formatPercent(volatility, format)}. ` +
    'Each year is drawn independently from one kind of investment, with spending that never changes and no tax, so real history can come out higher or lower, and the odds move a lot with these inputs.'
  )
}
