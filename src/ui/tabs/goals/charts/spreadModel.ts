/**
 * What the spread card says and draws, from a replay of the plan: the lines (the plan, the middle run, the
 * middle half as a band, the tenth and the ninetieth rank as dashed lines), the sentence on top, the years each
 * milestone is reached in, and what is assumed. The replay itself is the engine's (`replayMarket`).
 */
import { formatPercent, milestoneLabelWithAmount, type SpreadResult, type YearPoint } from '../../../../engine'
import type { MoneyFormat } from '../../../../engine/money'
import type { NewGoalScenario } from '../../../../data/dataSource'
import type { Milestone } from '../../../../types'
import type { ChartSeries } from '../../../charts/LinearChart'
import { planMoneyLabel } from '../planMoneyLabel'
import { yearLabel } from '../yearLabel'
import { inflateSeries } from './nominalTransform'

import { runsOfHundred } from './retirementOddsLine'
/** How many runs the card replays: enough that the bands do not wobble, few enough to stay quick while typing. */
export const SPREAD_RUNS = 10_000

const MIDDLE_COLOR = 'var(--exp-investment)'
const PLAN_COLOR = 'var(--color-text)'
/** A tenth of the runs below nothing is worth saying; one in twenty is not yet. */
const WARN_SHARE = 0.05

/**
 * A range of years from the lowest to the highest rank: "2044 to 2049", one year once, "2049 to after 2056"
 * when the upper rank is among the runs that never get there within the plan, and "not within 30 years" when
 * even the lower one is.
 */
export function rangeLabel(lo: number, hi: number, planStartDate: string | null, years: number): string {
  if (lo === Infinity) return `not within ${years} years`
  if (hi === Infinity) return `${yearLabel(lo, planStartDate)} to after ${yearLabel(years, planStartDate)}`
  if (lo === hi) return yearLabel(lo, planStartDate)
  return `${yearLabel(lo, planStartDate)} to ${yearLabel(hi, planStartDate)}`
}

export interface MilestoneRow {
  label: string
  /** Where the middle half of the runs get there. */
  middle: string
  /** Where 8 in 10 of them do. */
  wide: string
  gets: string
}

/** The years each milestone is reached in, one row each, in the order of the replay's milestones. */
export function milestoneRows({
  milestones,
  result,
  planStartDate,
  years,
  money,
}: {
  milestones: readonly Milestone[]
  result: SpreadResult
  planStartDate: string | null
  years: number
  money: (cents: number) => string
}): MilestoneRow[] {
  return milestones.map((m, k) => {
    const range = result.milestones[k]!
    return {
      label: `${milestoneLabelWithAmount(m, money)} on your account`,
      middle: rangeLabel(range.p25, range.p75, planStartDate, years),
      wide: rangeLabel(range.p10, range.p90, planStartDate, years),
      gets: `${runsOfHundred(range.share)} of 100`,
    }
  })
}

/** The row for the FI target, which is an amount in the plan's euros and not on the account. */
export function fiRow({
  result,
  planStartDate,
  years,
  money,
  targetCents,
}: {
  result: SpreadResult
  planStartDate: string | null
  years: number
  money: (cents: number) => string
  targetCents: number
}): MilestoneRow | null {
  const range = result.fi
  if (!range) return null
  return {
    label: `FI target (${money(targetCents)} in ${planMoneyLabel(planStartDate)})`,
    middle: rangeLabel(range.p25, range.p75, planStartDate, years),
    wide: rangeLabel(range.p10, range.p90, planStartDate, years),
    gets: `${runsOfHundred(range.share)} of 100`,
  }
}

/** The lines: the plan and the replay's ranks, in the money of the plan or of each year, ready for the chart. */
export function spreadSeries({
  plan,
  result,
  inflationRate,
  nominal,
}: {
  plan: readonly YearPoint[]
  result: SpreadResult
  inflationRate: number
  nominal: boolean
}): ChartSeries[] {
  const { after, before } = result
  const series: ChartSeries[] = [
    { id: 'p90', color: MIDDLE_COLOR, values: after.p90, preStep: before.p90, dashed: true, width: 1.25 },
    { id: 'p10', color: MIDDLE_COLOR, values: after.p10, preStep: before.p10, dashed: true, width: 1.25 },
    {
      id: 'band',
      color: MIDDLE_COLOR,
      kind: 'band',
      values: [],
      band: { lo: after.p25, hi: after.p75, loPre: before.p25, hiPre: before.p75 },
    },
    { id: 'median', color: MIDDLE_COLOR, values: after.p50, preStep: before.p50, width: 2 },
    {
      id: 'plan',
      color: PLAN_COLOR,
      values: plan.map((p) => p.investedCents),
      preStep: plan.map((p) => p.preEventInvestedCents),
      width: 2.5,
    },
  ]
  return nominal ? inflateSeries(series, series[0]!.values.map((_, i) => i), inflationRate) : series
}

/** Where the replay ends, against the plan's line, in a sentence. */
export function spreadHeadline({
  result,
  plan,
  money,
  moneyLabel,
  nominal,
  inflationRate = 0,
}: {
  result: SpreadResult
  plan: readonly YearPoint[]
  money: (cents: number) => string
  moneyLabel: string
  nominal: boolean
  inflationRate?: number
}): string {
  const year = result.years
  const grow = nominal ? Math.pow(1 + inflationRate, year) : 1
  const at = (cents: number) => money(Math.round(cents * grow))
  return `In year ${year}, in ${moneyLabel}: the middle run ends at ${at(result.after.p50[year]!)}, the plan's line at ${at(plan[year]?.investedCents ?? 0)}, the luckiest tenth above ${at(result.after.p90[year]!)} and the unluckiest tenth below ${at(result.after.p10[year]!)}.`
}

/**
 * What is replayed and what is left as planned: the assumptions a reader should be able to check, and which
 * euros the chart and the table are in, since they are not the same ones. `tableMoney` is the plan's euros, and
 * null where there is no table.
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
}): string {
  return [
    `Each of the ${runs.toLocaleString(format.locale)} runs replays your plan in a different market: every year's return is the typical ${formatPercent(realReturn, format)} a year times a luck factor with a bounce of ${formatPercent(volatility, format)}.`,
    'Only the market changes: the saving, the house, the events and the inflation are as planned.',
    'The line is the plan, half of the runs end in the shaded middle and 8 in 10 between the dashed lines.',
    'The picture is the same every time, so it moves only when you change something.',
  chartMoney,
  tableMoney,
  ].join(' ')
}

/** Said when more than one run in twenty has run out of money, which is what the lowest lines going under zero means. */
export function spreadWarning(result: SpreadResult): string | null {
  chartMoney: string
  tableMoney: string | null
  const year = result.belowZero.findIndex((share) => share >= WARN_SHARE)
  const table = tableMoney === null ? '' : ` In the table, milestone amounts are on your account and the FI target is in ${tableMoney}.`
  if (year < 0) return null
  const share = runsOfHundred(result.belowZero[year]!)
  return `In ${share}% of the runs the portfolio is below nothing from year ${year}: the house payment or an event takes more than it holds when the market is unkind.`
}

    `The chart is in ${chartMoney}.${table}`,
type Replayed = Pick<
  NewGoalScenario,
  | 'startInvestedCents'
  | 'monthlyContributionCents'
  | 'contributionSchedule'
  | 'expectedRealReturn'
  | 'horizonYears'
  | 'planStartDate'
  | 'housePriceCents'
  | 'houseAppreciationRate'
  | 'housePurchaseYear'
  | 'downPaymentFraction'
  | 'transactionCostsCents'
  | 'lifeEvents'
  | 'annualSpendCents'
  | 'safeWithdrawalRate'
>

/**
 * What the replay reads, as one string: a draft that differs only in its name or colour, or in the mortgage
 * the replay never looks at, is the same replay and is not made again.
 */
export function spreadKey(draft: Replayed, inflationRate: number, volatility: number, runs: number): string {
  return JSON.stringify([
    draft.startInvestedCents,
    draft.monthlyContributionCents,
    draft.contributionSchedule,
    draft.expectedRealReturn,
    draft.horizonYears,
    draft.planStartDate,
    draft.housePriceCents,
    draft.houseAppreciationRate,
    draft.housePurchaseYear,
    draft.downPaymentFraction,
    draft.transactionCostsCents,
    draft.lifeEvents,
    draft.annualSpendCents,
    draft.safeWithdrawalRate,
    inflationRate,
    volatility,
    runs,
  ])
}
