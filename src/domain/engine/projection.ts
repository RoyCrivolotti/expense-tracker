/**
 * Year-by-year wealth projection engine — reproduces finance-review path models.
 * All money in integer cents; rates as fractions (0.07 = 7% real).
 */
import { pmt } from './finance'

export interface YearPoint {
  year: number
  investedCents: number
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
  annualContributionGrowth: number
  expectedRealReturn: number
  horizonYears: number
  housePriceCents: number
  downPaymentFraction: number
  housePurchaseYear: HousePurchaseYear
  transactionCostsCents: number
  mortgageTermYears: number
  mortgageRateAnnual: number
  houseAppreciationRate: number
}

function annualContribution(
  monthlyCents: number,
  growth: number,
  year: number,
): number {
  if (year <= 0) return 0
  const factor = Math.pow(1 + growth, year - 1)
  return Math.round(monthlyCents * 12 * factor)
}

function houseEquityAtYear(
  housePriceCents: number,
  appreciation: number,
  purchaseYear: HousePurchaseYear,
  year: number,
): number {
  if (purchaseYear === null || year < purchaseYear) return 0
  const yearsOwned = year - purchaseYear
  return Math.round(housePriceCents * Math.pow(1 + appreciation, yearsOwned))
}

function mortgageBalanceAtYear(
  loanCents: number,
  rateAnnual: number,
  termYears: number,
  purchaseYear: HousePurchaseYear,
  year: number,
): number {
  if (purchaseYear === null || loanCents <= 0 || year < purchaseYear) return 0
  const monthsElapsed = Math.min((year - purchaseYear) * 12, termYears * 12)
  if (monthsElapsed <= 0) return loanCents
  const monthlyRate = rateAnnual / 12
  const totalMonths = termYears * 12
  if (monthlyRate === 0) {
    const paid = Math.round((loanCents / totalMonths) * monthsElapsed)
    return Math.max(0, loanCents - paid)
  }
  const payment = pmt(monthlyRate, totalMonths, loanCents)
  const growth = Math.pow(1 + monthlyRate, monthsElapsed)
  const balance = loanCents * growth - payment * ((growth - 1) / monthlyRate)
  return Math.max(0, Math.round(balance))
}

function purchaseWithdrawalCents(params: ProjectionParams): number {
  const down = Math.round(params.housePriceCents * params.downPaymentFraction)
  return down + params.transactionCostsCents
}

/** Simulate invested portfolio + housing net worth year-by-year. */
export function projectNetWorth(params: ProjectionParams): YearPoint[] {
  const loanCents =
    params.housePurchaseYear !== null
      ? params.housePriceCents -
        Math.round(params.housePriceCents * params.downPaymentFraction)
      : 0

  const points: YearPoint[] = []
  let invested = params.startInvestedCents

  for (let year = 0; year <= params.horizonYears; year++) {
    const contrib =
      year === 0 ? 0 : annualContribution(
        params.monthlyContributionCents,
        params.annualContributionGrowth,
        year,
      )

    if (year > 0) {
      invested = Math.round(
        invested * (1 + params.expectedRealReturn) + contrib,
      )
      if (
        params.housePurchaseYear !== null &&
        params.housePurchaseYear > 0 &&
        year === params.housePurchaseYear
      ) {
        invested -= purchaseWithdrawalCents(params)
      }
    }

    const houseEquity = houseEquityAtYear(
      params.housePriceCents,
      params.houseAppreciationRate,
      params.housePurchaseYear,
      year,
    )
    const mortgageBalance = mortgageBalanceAtYear(
      loanCents,
      params.mortgageRateAnnual,
      params.mortgageTermYears,
      params.housePurchaseYear,
      year,
    )

    points.push({
      year,
      investedCents: invested,
      houseEquityCents: houseEquity,
      mortgageBalanceCents: mortgageBalance,
      netWorthCents: invested + houseEquity - mortgageBalance,
      annualContributionCents: contrib,
    })
  }

  return points
}

/** Invested-portfolio trajectory only (matches finance-review milestone matrix). */
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

/** Annual savings from gross salary minus monthly expenses (Beckham net model). */
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

export function yearsToFi(
  params: ProjectionParams,
  annualSpendCents: number,
  swr: number,
): number | null {
  const target = fireNumber(annualSpendCents, swr)
  return yearsToTargetFromProjection(params, target, true)
}

/** Monthly mortgage payment for rent-vs-own comparison. */
export function monthlyMortgageCents(params: ProjectionParams): number {
  if (params.housePurchaseYear === null) return 0
  const loan =
    params.housePriceCents -
    Math.round(params.housePriceCents * params.downPaymentFraction)
  if (loan <= 0) return 0
  return Math.round(
    pmt(
      params.mortgageRateAnnual / 12,
      params.mortgageTermYears * 12,
      loan,
    ),
  )
}

/** Year-by-year drawdown after reaching FI (constant real withdrawal). */
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
