import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HOUSE_APPRECIATION,
  DEFAULT_INFLATION_RATE,
  DEFAULT_MORTGAGE_RATE,
  DEFAULT_MORTGAGE_TERM_YEARS,
  DEFAULT_REAL_RETURN,
  DEFAULT_TRANSACTION_COSTS_CENTS,
} from './projectionConstants'
import { paidShareOfYear, projectRentVsBuy, rentVsBuyVerdict, type RentVsBuyInput } from './rentVsBuy'
import { monthlyMortgageCents, projectNetWorth, type ProjectionParams } from './projection'

function baseParams(overrides: Partial<ProjectionParams> = {}): ProjectionParams {
  return {
    startInvestedCents: 10_000_000,
    monthlyContributionCents: 100_000,
    expectedRealReturn: DEFAULT_REAL_RETURN,
    horizonYears: 30,
    housePriceCents: 400_000_000,
    downPaymentFraction: 0.2,
    housePurchaseYear: null,
    transactionCostsCents: DEFAULT_TRANSACTION_COSTS_CENTS,
    mortgageTermYears: DEFAULT_MORTGAGE_TERM_YEARS,
    mortgageRateAnnual: DEFAULT_MORTGAGE_RATE,
    houseAppreciationRate: DEFAULT_HOUSE_APPRECIATION,
    inflationRate: DEFAULT_INFLATION_RATE,
    ...overrides,
  }
}

function input(overrides: Partial<RentVsBuyInput> = {}): RentVsBuyInput {
  return { params: baseParams(), rentMonthlyCents: 120_000, ...overrides }
}

describe('projectRentVsBuy', () => {
  it('returns no comparison when there is no house price', () => {
    const result = projectRentVsBuy(input({ params: baseParams({ housePriceCents: 0 }) }))
    expect(result.points).toHaveLength(0)
    expect(result.breakevenYear).toBeNull()
    expect(result.verdict).toBeNull()
  })

  it('produces one point per year from the purchase to ten years after the loan, year 0 included', () => {
    const result = projectRentVsBuy(input())
    // A 30-year loan: years 0 to 40.
    expect(result.points).toHaveLength(41)
    expect(result.points[0]?.year).toBe(0)
  })

  it('year 0 starts the renter with the down payment + costs and the buyer with home equity', () => {
    const result = projectRentVsBuy(input())
    const upfront = Math.round(400_000_000 * 0.2) + DEFAULT_TRANSACTION_COSTS_CENTS
    const down = Math.round(400_000_000 * 0.2)
    expect(result.points[0]?.rentNetWorthCents).toBe(upfront)
    // Buyer's net worth at purchase is their equity (the down payment), no side portfolio yet.
    expect(result.points[0]?.buyNetWorthCents).toBe(down)
  })

  it('cheap rent (renter invests the surplus) never lets buying break even', () => {
    const result = projectRentVsBuy(
      input({ rentMonthlyCents: 10_000, params: baseParams({ horizonYears: 20 }) }),
    )
    expect(result.breakevenYear).toBeNull()
  })

  it('very high rent makes buying overtake renting within the horizon', () => {
    const result = projectRentVsBuy(input({ rentMonthlyCents: 2_000_000 }))
    expect(result.breakevenYear).not.toBeNull()
    const cross = result.breakevenYear ?? 0
    const at = result.points[cross]
    expect(at && at.buyNetWorthCents >= at.rentNetWorthCents).toBe(true)
  })

  it('does not call the first year buying draws level a breakeven when renting pulls ahead again for good', () => {
    // 400k house, 20% down, the default 500 of costs, rent 1,200: buying leads for four years on the
    // equity it builds, then the renter's side portfolio compounds past it and never looks back.
    const params = baseParams({
      housePriceCents: 40_000_000,
      downPaymentFraction: 0.2,
      transactionCostsCents: 50_000,
      mortgageRateAnnual: 0.03,
      mortgageTermYears: 30,
      houseAppreciationRate: 0.025,
      expectedRealReturn: 0.07,
      inflationRate: 0.02,
    })
    const result = projectRentVsBuy({ params, rentMonthlyCents: 120_000 })
    expect(result.verdict).toEqual({ kind: 'rent-takes-over', buyAheadThrough: 4 })
    expect(result.breakevenYear).toBeNull()
    const last = result.points[result.points.length - 1]!
    expect(last.rentNetWorthCents).toBeGreaterThan(last.buyNetWorthCents)
  })

  it('counts the mortgage payment in today\'s money, so it shrinks against a constant rent', () => {
    const params = baseParams({ housePurchaseYear: null })
    const payment = monthlyMortgageCents({ ...params, housePurchaseYear: 0 })
    // Rent equal to the payment: at a fixed nominal payment the buyer is ahead in today's
    // money, so it is the buyer who has a surplus to invest from year one.
    const result = projectRentVsBuy({ params, rentMonthlyCents: payment, carryRate: 0 })
    const year1 = projectNetWorth({ ...params, housePurchaseYear: 0 })[1]!
    const buySidePortfolio = result.points[1]!.buyNetWorthCents - (year1.houseEquityCents - year1.mortgageBalanceCents)
    const annual = payment * 12
    expect(buySidePortfolio).toBe(annual - Math.round(annual / (1 + DEFAULT_INFLATION_RATE)))
    expect(buySidePortfolio).toBeGreaterThan(0)
  })

  it('pays the months a loan has left in the year it ends in, not the whole year and not none of it', () => {
    // 24 years and 7 months left: the 25th year has seven payments in it.
    expect(paidShareOfYear(25, 24 + 7 / 12)).toBeCloseTo(7 / 12, 10)
    expect(paidShareOfYear(24, 24 + 7 / 12)).toBe(1)
    expect(paidShareOfYear(26, 24 + 7 / 12)).toBe(0)
    // A whole term is as it was: every year up to it in full, none after.
    expect(paidShareOfYear(30, 30)).toBe(1)
    expect(paidShareOfYear(31, 30)).toBe(0)
    expect(paidShareOfYear(1, 30)).toBe(1)
  })

  it('shrinks the payment by the inflation it is given', () => {
    const rate = 0.05
    const params = baseParams({ housePurchaseYear: null, inflationRate: rate })
    const payment = monthlyMortgageCents({ ...params, housePurchaseYear: 0 })
    const result = projectRentVsBuy({ params, rentMonthlyCents: payment, carryRate: 0 })
    const year1 = projectNetWorth({ ...params, housePurchaseYear: 0 })[1]!
    const buySidePortfolio = result.points[1]!.buyNetWorthCents - (year1.houseEquityCents - year1.mortgageBalanceCents)
    const annual = payment * 12
    expect(buySidePortfolio).toBe(annual - Math.round(annual / (1 + rate)))
  })
})

describe('rentVsBuyVerdict', () => {
  const at = (diffs: number[]): Parameters<typeof rentVsBuyVerdict>[0] =>
    [0, ...diffs].map((diff, year) => ({ year, rentNetWorthCents: 1_000, buyNetWorthCents: 1_000 + diff }))

  it('says nothing without a year after the purchase', () => {
    expect(rentVsBuyVerdict([])).toBeNull()
    expect(rentVsBuyVerdict(at([]))).toBeNull()
  })

  it('names the side that leads in every year', () => {
    expect(rentVsBuyVerdict(at([-5, -9, -20]))).toEqual({ kind: 'rent-ahead' })
    expect(rentVsBuyVerdict(at([5, 9, 20]))).toEqual({ kind: 'buy-ahead' })
  })

  it('names the year buying takes over for good, after a stretch behind', () => {
    expect(rentVsBuyVerdict(at([-5, -9, 3, 10]))).toEqual({ kind: 'buy-takes-over', year: 3 })
  })

  it('names the last year buying led when renting overtakes it', () => {
    expect(rentVsBuyVerdict(at([5, 9, -3, -10]))).toEqual({ kind: 'rent-takes-over', buyAheadThrough: 2 })
  })

  it('goes by where the horizon ends when the lead changes hands more than once', () => {
    expect(rentVsBuyVerdict(at([5, -2, 4, -1, 6]))).toEqual({ kind: 'buy-takes-over', year: 5 })
    expect(rentVsBuyVerdict(at([-5, 2, -4, 1, -6]))).toEqual({ kind: 'rent-takes-over', buyAheadThrough: 4 })
  })

  it('counts a draw as buying leading, as the comparison always has', () => {
    expect(rentVsBuyVerdict(at([0, 0]))).toEqual({ kind: 'buy-ahead' })
  })
})
