/**
 * Year-by-year wealth projection engine — reproduces the private workbook’s path models.
 * All money in integer cents; rates as fractions (0.07 = 7% real).
 */
import { type ScheduleStep } from './contributionSchedule'
import { pmt } from './finance'
import { housePriceAtPurchaseCents, realHouseGrowth } from './housePrice'
import { purchaseWithdrawalCents, stepInvested, yearFlows } from './investedStep'
import type { LifeEvent } from '../types'

export interface YearPoint {
  year: number
  /** The portfolio at the end of the year's anniversary, after a house payment and life events that year. */
  investedCents: number
  /**
   * The portfolio on the day before the year's house payment and life events, which land on the
   * anniversary: what the year's return and contributions made of it. The same as `investedCents`
   * in a year with no payment or event, so the plan's line rises to this and steps to the next.
   */
  preEventInvestedCents: number
  /** What the house is worth, in the plan's euros: not net of the mortgage, which is `mortgageBalanceCents`. */
  houseEquityCents: number
  mortgageBalanceCents: number
  netWorthCents: number
  annualContributionCents: number
}

/** null = never buy; 0 = owned from day one (capital already allocated). */
export type HousePurchaseYear = number | null

export interface ProjectionParams {
  startInvestedCents: number
  monthlyContributionCents: number
  expectedRealReturn: number
  horizonYears: number
  housePriceCents: number
  downPaymentFraction: number
  housePurchaseYear: HousePurchaseYear
  transactionCostsCents: number
  mortgageTermYears: number
  mortgageRateAnnual: number
  houseAppreciationRate: number
  /**
   * The yearly inflation the plan assumes (0.02 = 2%), from the owner's setting. Required, with
   * no fallback: the house and the mortgage are brought back to the plan's euros by it.
   */
  inflationRate: number
  /** One-off cash flows applied at specific projection years. Default: none. */
  lifeEvents?: LifeEvent[]
  /**
   * Changes to the monthly amount from a point on the plan's axis, in order (see
   * `scheduleSteps`). Default: none, so the monthly amount stays what it starts as. Amounts are
   * euros as sent, not the plan's euros: the projection brings them back by `inflationRate`.
   */
  contributionSteps?: ScheduleStep[]
}

/**
 * What the house is worth in a year, in the plan's money, from the price it was bought at
 * (`housePriceAtPurchaseCents`). It grows by what it beats inflation by, so it is worth the
 * price entered today grown the whole way, and nothing before it is bought.
 */
function houseEquityAtYear(
  priceAtPurchaseCents: number,
  appreciation: number,
  inflationRate: number,
  purchaseYear: HousePurchaseYear,
  year: number,
): number {
  if (purchaseYear === null || year < purchaseYear) return 0
  const yearsOwned = year - purchaseYear
  return Math.round(priceAtPurchaseCents * Math.pow(realHouseGrowth(appreciation, inflationRate), yearsOwned))
}

/**
 * What is still owed, in the plan's euros. The loan is a fixed schedule at the bank's
 * (nominal) rate, so its balance is deflated by the years since purchase: inflation eats
 * into a debt that does not grow with it.
 */
function mortgageBalanceAtYear(
  loanCents: number,
  rateAnnual: number,
  termYears: number,
  inflationRate: number,
  purchaseYear: HousePurchaseYear,
  year: number,
): number {
  if (purchaseYear === null || loanCents <= 0 || year < purchaseYear) return 0
  const monthsElapsed = Math.min((year - purchaseYear) * 12, termYears * 12)
  if (monthsElapsed <= 0) return loanCents
  const monthlyRate = rateAnnual / 12
  const totalMonths = termYears * 12
  const deflator = Math.pow(1 + inflationRate, year - purchaseYear)
  if (monthlyRate === 0) {
    const paid = Math.round((loanCents / totalMonths) * monthsElapsed)
    return Math.max(0, Math.round((loanCents - paid) / deflator))
  }
  const payment = pmt(monthlyRate, totalMonths, loanCents)
  const growth = Math.pow(1 + monthlyRate, monthsElapsed)
  const balance = loanCents * growth - payment * ((growth - 1) / monthlyRate)
  return Math.max(0, Math.round(balance / deflator))
}

export interface PurchaseYearBreakdown {
  year: number
  startInvestedCents: number
  growthCents: number
  contributionCents: number
  beforePurchaseCents: number
  downPaymentCents: number
  transactionCostsCents: number
  totalWithdrawalCents: number
  endInvestedCents: number
  netChangeCents: number
}

/** Step-by-step invested balance at a deferred house-purchase year (null if not applicable). */
export function purchaseYearBreakdown(
  params: ProjectionParams,
  year: number,
): PurchaseYearBreakdown | null {
  const purchaseYear = params.housePurchaseYear
  if (purchaseYear === null || purchaseYear <= 0 || year !== purchaseYear) return null

  const points = projectNetWorth(params)
  const prior = points.find((p) => p.year === year - 1)
  const current = points.find((p) => p.year === year)
  if (!prior || !current) return null

  const startInvestedCents = prior.investedCents
  const contributionCents = current.annualContributionCents
  const beforePurchaseCents = current.preEventInvestedCents
  const growthCents = beforePurchaseCents - contributionCents - startInvestedCents
  const downPaymentCents = Math.round(housePriceAtPurchaseCents(params) * params.downPaymentFraction)
  const transactionCostsCents = params.transactionCostsCents
  const totalWithdrawalCents = purchaseWithdrawalCents(params)
  const endInvestedCents = current.investedCents

  return {
    year,
    startInvestedCents,
    growthCents,
    contributionCents,
    beforePurchaseCents,
    downPaymentCents,
    transactionCostsCents,
    totalWithdrawalCents,
    endInvestedCents,
    netChangeCents: endInvestedCents - startInvestedCents,
  }
}

/** Simulate invested portfolio + housing net worth year-by-year. */
export function projectNetWorth(params: ProjectionParams): YearPoint[] {
  const priceCents = housePriceAtPurchaseCents(params)
  const loanCents =
    params.housePurchaseYear !== null
      ? priceCents - Math.round(priceCents * params.downPaymentFraction)
      : 0

  const points: YearPoint[] = []
  let invested = params.startInvestedCents

  for (let year = 0; year <= params.horizonYears; year++) {
    const flows = yearFlows(params, year)

    let preEvent = invested
    if (year > 0) {
      // The year's payments land at its end and earn nothing until the next year, a little
      // cautious against paying each month (up to about 3% over thirty years at 7%). The plan
      // keeps that convention on purpose, and the glossary says so.
      const step = stepInvested(invested, 1 + params.expectedRealReturn, flows)
      preEvent = step.pre
      invested = step.post
    }

    const houseEquity = houseEquityAtYear(
      priceCents,
      params.houseAppreciationRate,
      params.inflationRate,
      params.housePurchaseYear,
      year,
    )
    const mortgageBalance = mortgageBalanceAtYear(
      loanCents,
      params.mortgageRateAnnual,
      params.mortgageTermYears,
      params.inflationRate,
      params.housePurchaseYear,
      year,
    )

    points.push({
      year,
      investedCents: invested,
      preEventInvestedCents: preEvent,
      houseEquityCents: houseEquity,
      mortgageBalanceCents: mortgageBalance,
      netWorthCents: invested + houseEquity - mortgageBalance,
      annualContributionCents: flows.contributionCents,
    })
  }

  return points
}

/** Invested-portfolio trajectory only (matches the workbook’s milestone matrix). */
export function projectInvested(params: ProjectionParams): number[] {
  return projectNetWorth(params).map((p) => p.investedCents)
}

export function yearsToTarget(series: number[], targetCents: number): number | null {
  const idx = series.findIndex((v) => v >= targetCents)
  return idx === -1 ? null : idx
}

export function yearsToTargetFromProjection(
  params: ProjectionParams,
  targetCents: number,
  useNetWorth = false,
): number | null {
  const series = projectNetWorth(params).map((p) =>
    useNetWorth ? p.netWorthCents : p.investedCents,
  )
  return yearsToTarget(series, targetCents)
}

/** Annual savings from gross salary minus monthly expenses (net retention model). */
export function annualSavingsFromCashflow(
  grossCents: number,
  expenseMonthlyCents: number,
  netRetention = 0.65,
  onCallMonthlyCents = 50_000,
): number {
  const monthlyNet = Math.round((grossCents * netRetention) / 12)
  const totalMonthly = monthlyNet + onCallMonthlyCents
  return Math.max(0, (totalMonthly - expenseMonthlyCents) * 12)
}

/** FIRE number: annual spend divided by safe withdrawal rate. */
export function fireNumber(annualSpendCents: number, swr: number): number {
  if (swr <= 0) return Infinity
  return Math.round(annualSpendCents / swr)
}

/**
 * The year the invested portfolio reaches the FI target. The portfolio, not the net worth: what
 * the withdrawal rate draws on is what can be sold and spent, and a house is not that. It is
 * also the measure the milestones use, so the two cannot disagree about a plan with a house
 * (net worth with the house in it said "year 0" where the portfolio had a decade to go).
 */
export function yearsToFi(
  params: ProjectionParams,
  annualSpendCents: number,
  swr: number,
): number | null {
  const target = fireNumber(annualSpendCents, swr)
  return yearsToTargetFromProjection(params, target, false)
}

/** Monthly mortgage payment for rent-vs-own comparison. */
export function monthlyMortgageCents(params: ProjectionParams): number {
  if (params.housePurchaseYear === null) return 0
  const priceCents = housePriceAtPurchaseCents(params)
  const loan = priceCents - Math.round(priceCents * params.downPaymentFraction)
  if (loan <= 0) return 0
  return Math.round(
    pmt(
      params.mortgageRateAnnual / 12,
      params.mortgageTermYears * 12,
      loan,
    ),
  )
}

/** Year-by-year drawdown after reaching FI (a constant withdrawal in the plan's euros, like the rest of the plan). */
export function projectDrawdown(
  startPortfolioCents: number,
  annualWithdrawalCents: number,
  expectedRealReturn: number,
  horizonYears: number,
): number[] {
  const series = [startPortfolioCents]
  let bal = startPortfolioCents
  for (let y = 1; y <= horizonYears; y++) {
    bal = Math.round(bal * (1 + expectedRealReturn) - annualWithdrawalCents)
    series.push(Math.max(0, bal))
  }
  return series
}
