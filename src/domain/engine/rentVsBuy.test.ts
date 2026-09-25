import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HOUSE_APPRECIATION,
  DEFAULT_INFLATION_RATE,
  DEFAULT_MORTGAGE_RATE,
  DEFAULT_MORTGAGE_TERM_YEARS,
  DEFAULT_REAL_RETURN,
  DEFAULT_TRANSACTION_COSTS_CENTS,
} from './projectionConstants'
import { projectRentVsBuy, type RentVsBuyInput } from './rentVsBuy'
import { monthlyMortgageCents, projectNetWorth, type ProjectionParams } from './projection'

function baseParams(overrides: Partial<ProjectionParams> = {}): ProjectionParams {
  return {
    startInvestedCents: 10_000_000,
    monthlyContributionCents: 100_000,
    annualContributionGrowth: 0,
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
  })

  it('produces one point per projected year including year 0', () => {
    const result = projectRentVsBuy(input())
    expect(result.points).toHaveLength(31)
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

  it('counts the mortgage payment in today\'s money, so it shrinks against a constant rent', () => {
    const params = baseParams({ housePurchaseYear: 5 })
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

  it('shrinks the payment by the inflation it is given', () => {
    const rate = 0.05
    const params = baseParams({ housePurchaseYear: 5, inflationRate: rate })
    const payment = monthlyMortgageCents({ ...params, housePurchaseYear: 0 })
    const result = projectRentVsBuy({ params, rentMonthlyCents: payment, carryRate: 0 })
    const year1 = projectNetWorth({ ...params, housePurchaseYear: 0 })[1]!
    const buySidePortfolio = result.points[1]!.buyNetWorthCents - (year1.houseEquityCents - year1.mortgageBalanceCents)
    const annual = payment * 12
    expect(buySidePortfolio).toBe(annual - Math.round(annual / (1 + rate)))
  })
})
