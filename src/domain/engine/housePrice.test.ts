import { describe, expect, it } from 'vitest'
import { samplePlan, SAMPLE_INFLATION } from '../../testing/samplePlan'
import { housePriceAtPurchaseCents, realHouseGrowth } from './housePrice'
import { monthlyMortgageCents, projectNetWorth, purchaseYearBreakdown } from './projection'
import { projectRentVsBuy } from './rentVsBuy'
import { scenarioToParams } from './scenarioProjection'

const params = (over = {}) => scenarioToParams(samplePlan(over), SAMPLE_INFLATION)

describe('housePriceAtPurchaseCents', () => {
  it('grows the price by what houses beat inflation by, for each year until the purchase', () => {
    // 300.000 euros today, houses +3% a year, inflation 2%, bought in year 8.
    const expected = Math.round(30_000_000 * Math.pow(1.03 / 1.02, 8))
    expect(housePriceAtPurchaseCents(params())).toBe(expected)
    expect(expected).toBe(32_435_282)
  })

  it('is the price as typed when houses only keep up with inflation', () => {
    expect(housePriceAtPurchaseCents(params({ houseAppreciationRate: SAMPLE_INFLATION }))).toBe(30_000_000)
  })

  it('falls when houses lag inflation', () => {
    expect(housePriceAtPurchaseCents(params({ houseAppreciationRate: 0.01 }))).toBeLessThan(30_000_000)
  })

  it.each([
    ['no purchase', { housePurchaseYear: null }],
    ['a house already owned', { housePurchaseYear: 0 }],
  ])('leaves the price alone for %s', (_name, over) => {
    expect(housePriceAtPurchaseCents(params(over))).toBe(30_000_000)
  })

  it('has no price to grow when none is entered', () => {
    expect(housePriceAtPurchaseCents(params({ housePriceCents: 0 }))).toBe(0)
  })

  it('is the same growth the house keeps once it is bought', () => {
    expect(realHouseGrowth(0.03, 0.02)).toBeCloseTo(1.03 / 1.02, 12)
  })
})

describe('the house in the projection', () => {
  const priceAtPurchase = 32_435_282

  it('takes the down payment from the price at purchase, not from today’s price', () => {
    const breakdown = purchaseYearBreakdown(params(), 8)!
    expect(breakdown.downPaymentCents).toBe(Math.round(priceAtPurchase * 0.2))
    expect(breakdown.totalWithdrawalCents).toBe(Math.round(priceAtPurchase * 0.2) + 600_000)
  })

  it('borrows the rest of the price at purchase', () => {
    const loan = priceAtPurchase - Math.round(priceAtPurchase * 0.2)
    const points = projectNetWorth(params())
    expect(points[8]!.mortgageBalanceCents).toBe(loan)
  })

  it('values the house at the price at purchase in the year it is bought and keeps growing it from there', () => {
    const points = projectNetWorth(params())
    expect(points[7]!.houseEquityCents).toBe(0)
    expect(points[8]!.houseEquityCents).toBe(priceAtPurchase)
    // Today's price grown the whole way: the same as growing the price at purchase from year 8.
    for (const year of [8, 12, 20, 30]) {
      const whole = Math.round(30_000_000 * Math.pow(1.03 / 1.02, year))
      expect(Math.abs(points[year]!.houseEquityCents - whole)).toBeLessThanOrEqual(1)
    }
  })

  it('prices the monthly payment on the loan at purchase', () => {
    const grown = monthlyMortgageCents(params())
    const flat = monthlyMortgageCents(params({ houseAppreciationRate: SAMPLE_INFLATION }))
    expect(grown / flat).toBeCloseTo(priceAtPurchase / 30_000_000, 3)
  })

  it('changes nothing when houses only keep up with inflation', () => {
    // The grown price equals the typed one, so the plan is the one a flat price gives.
    const flat = params({ houseAppreciationRate: SAMPLE_INFLATION })
    const points = projectNetWorth(flat)
    expect(points[8]!.houseEquityCents).toBe(30_000_000)
    expect(purchaseYearBreakdown(flat, 8)!.downPaymentCents).toBe(6_000_000)
    expect(points.every((p) => p.houseEquityCents === 0 || p.houseEquityCents === 30_000_000)).toBe(true)
  })

  it('does not move a house bought on day one, or the comparison that buys today', () => {
    const owned = projectNetWorth(params({ housePurchaseYear: 0 }))
    expect(owned[0]!.houseEquityCents).toBe(30_000_000)
    // Rent against buy starts from today's price whatever year the plan buys in.
    const now = projectRentVsBuy({ params: params({ housePurchaseYear: 0 }), rentMonthlyCents: 100_000 })
    const later = projectRentVsBuy({ params: params({ housePurchaseYear: 8 }), rentMonthlyCents: 100_000 })
    expect(later.points).toEqual(now.points)
  })
})
