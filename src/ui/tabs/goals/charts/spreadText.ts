import { formatPercent, type SpreadResult, type YearPoint } from '../../../../engine'
import type { MoneyFormat } from '../../../../engine/money'
import { runsOfHundred } from './retirementOddsLine'

/** A tenth of the runs below nothing is worth saying; one in twenty is not yet. */
const WARN_SHARE = 0.05

/**
 * Where the replay ends, against the plan's line, in a sentence. It opens by saying what a run is, since the
 * card uses the word before it has explained itself.
 */
export function spreadHeadline({
  result,
  plan,
  money,
  moneyLabel,
  nominal,
  inflationRate = 0,
  runs,
  format,
}: {
  result: SpreadResult
  plan: readonly YearPoint[]
  money: (cents: number) => string
  moneyLabel: string
  nominal: boolean
  inflationRate?: number
  runs: number
  format: MoneyFormat
}): string {
  const year = result.years
  const grow = nominal ? Math.pow(1 + inflationRate, year) : 1
  const at = (cents: number) => money(Math.round(cents * grow))
  return `The plan replayed in ${runs.toLocaleString(format.locale)} markets, each one a run. In year ${year}, in ${moneyLabel}, the middle run ends at ${at(result.after.p50[year]!)}, the plan at ${at(plan[year]?.investedCents ?? 0)}, the luckiest tenth of runs above ${at(result.after.p90[year]!)} and the unluckiest tenth below ${at(result.after.p10[year]!)}.`
}

/**
 * What is replayed and what is left as planned, in two parts. The lead is the caveat that stops the card being read as a
 * forecast of everything: only the market changes. The details are the assumptions a reader can check, behind a
 * disclosure. Which euros the chart and the table are in is said by the headline and by each row of the table.
 */
export function spreadCaption({
  runs,
  volatility,
  realReturn,
  format,
}: {
  runs: number
  volatility: number
  realReturn: number
  format: MoneyFormat
}): { lead: string; details: string[] } {
  return {
    lead: 'Only the market changes: the saving, the house, the events and the inflation are as planned.',
    details: [
      `Each of the ${runs.toLocaleString(format.locale)} runs replays your plan in a different market: every year's return is the typical ${formatPercent(realReturn, format)} a year times a luck factor with a bounce of ${formatPercent(volatility, format)} (the Market bounce in Assumptions).`,
      'The picture is the same every time, so it moves only when you change something.',
    ],
  }
}

/** Said when more than one run in twenty has run out of money, which is what the lowest lines going under zero means. */
export function spreadWarning(result: SpreadResult): string | null {
  const year = result.belowZero.findIndex((share) => share >= WARN_SHARE)
  if (year < 0) return null
  const share = runsOfHundred(result.belowZero[year]!)
  return `In ${share}% of the runs the portfolio is below nothing from year ${year}: the house payment or an event takes more than it holds when the market is unkind.`
}
