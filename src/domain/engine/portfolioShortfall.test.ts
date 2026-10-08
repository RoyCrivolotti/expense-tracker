import { describe, expect, it } from 'vitest'
import { portfolioShortfall } from './portfolioShortfall'
import { projectNetWorth, type ProjectionParams } from './projection'

// 20.000 € and 500 € a month at 7%, no inflation so the monthly amount is the same every year.
const plan: ProjectionParams = {
  startInvestedCents: 2_000_000,
  monthlyContributionCents: 50_000,
  expectedRealReturn: 0.07,
  horizonYears: 10,
  housePriceCents: 40_000_000,
  downPaymentFraction: 0.2,
  housePurchaseYear: null,
  transactionCostsCents: 0,
  mortgageTermYears: 30,
  mortgageRateAnnual: 0.03,
  houseAppreciationRate: 0.025,
  inflationRate: 0,
}

describe('portfolioShortfall', () => {
  it('is nothing for a plan that never buys', () => {
    expect(portfolioShortfall(plan)).toBeNull()
  })

  it('is nothing when the portfolio covers the purchase', () => {
    expect(portfolioShortfall({ ...plan, startInvestedCents: 20_000_000, housePurchaseYear: 3 })).toBeNull()
  })

  it('is nothing for a house owned from the start, whose capital is already allocated', () => {
    expect(portfolioShortfall({ ...plan, housePurchaseYear: 0 })).toBeNull()
  })

  it('is nothing for a purchase beyond the horizon, which the plan never reaches', () => {
    expect(portfolioShortfall({ ...plan, housePurchaseYear: 12 })).toBeNull()
  })

  it('names the year the house takes the portfolio below zero, and by how much', () => {
    const params = { ...plan, housePurchaseYear: 5 }
    const points = projectNetWorth(params)

    expect(points[4]!.investedCents).toBeGreaterThan(0)
    expect(portfolioShortfall(params)).toEqual({
      year: 5,
      belowZeroCents: -points[5]!.investedCents,
      cause: 'house',
      housePaymentCents: 8_000_000,
    })
  })

  it('counts the purchase costs with the down payment', () => {
    const shortfall = portfolioShortfall({ ...plan, housePurchaseYear: 5, transactionCostsCents: 500_000 })
    expect(shortfall?.housePaymentCents).toBe(8_500_000)
  })

  it('blames a life event when the house alone fits', () => {
    const params = {
      ...plan,
      startInvestedCents: 20_000_000,
      housePurchaseYear: 3,
      lifeEvents: [{ year: 3, amountCents: -30_000_000, label: 'Renovation' }],
    }
    expect(portfolioShortfall(params)).toEqual({
      year: 3,
      belowZeroCents: -projectNetWorth(params)[3]!.investedCents,
      cause: 'event',
      housePaymentCents: 0,
    })
  })

  it('still blames the house when it is short and an event lands in the same year', () => {
    const params = {
      ...plan,
      housePurchaseYear: 5,
      lifeEvents: [{ year: 5, amountCents: -100_000, label: 'Car' }],
    }
    expect(portfolioShortfall(params)).toMatchObject({ year: 5, cause: 'house', housePaymentCents: 8_000_000 })
  })

  it('reports the first year only, with a life event after a purchase that was paid', () => {
    const params = {
      ...plan,
      startInvestedCents: 20_000_000,
      housePurchaseYear: 3,
      lifeEvents: [{ year: 6, amountCents: -90_000_000, label: 'Sabbatical' }],
    }
    expect(portfolioShortfall(params)).toMatchObject({ year: 6, cause: 'event', housePaymentCents: 0 })
  })

  it('is not set off by an inflow in the purchase year that covers it', () => {
    const params = {
      ...plan,
      housePurchaseYear: 5,
      lifeEvents: [{ year: 5, amountCents: 20_000_000, label: 'Inheritance' }],
    }
    expect(portfolioShortfall(params)).toBeNull()
  })
})
