import { describe, expect, it } from 'vitest'
import { samplePlan, SAMPLE_INFLATION } from '../../testing/samplePlan'
import { projectNetWorth, purchaseYearBreakdown } from './projection'
import { scenarioToParams } from './scenarioProjection'

const points = (over = {}) => projectNetWorth(scenarioToParams(samplePlan(over), SAMPLE_INFLATION))

describe('the portfolio before a year’s house payment and events', () => {
  it('is the year’s value before anything leaves or arrives, and the same as the end of the year when nothing does', () => {
    const plain = points({ housePurchaseYear: null })
    for (const p of plain) expect(p.preEventInvestedCents).toBe(p.investedCents)
  })

  it('differs from the end of the year by the house payment in the purchase year only', () => {
    const withHouse = points()
    const payment = Math.round(32_435_282 * 0.2) + 600_000
    expect(withHouse[8]!.preEventInvestedCents - withHouse[8]!.investedCents).toBe(payment)
    for (const p of withHouse) if (p.year !== 8) expect(p.preEventInvestedCents).toBe(p.investedCents)
  })

  it('is what the year before ends at, grown and topped up', () => {
    const p = points()
    // Year 8: the 5% of the year on the year 7 balance, plus that year’s contribution, before the payment.
    expect(p[8]!.preEventInvestedCents).toBe(Math.round(p[7]!.investedCents * 1.05 + p[8]!.annualContributionCents))
  })

  it('counts a life event as part of the step, up for money in and down for money out', () => {
    const inflow = points({ housePurchaseYear: null, lifeEvents: [{ year: 5, amountCents: 2_000_000, label: 'Bonus' }] })
    expect(inflow[5]!.investedCents - inflow[5]!.preEventInvestedCents).toBe(2_000_000)
    const outflow = points({ housePurchaseYear: null, lifeEvents: [{ year: 5, amountCents: -2_000_000, label: 'Car' }] })
    expect(outflow[5]!.investedCents - outflow[5]!.preEventInvestedCents).toBe(-2_000_000)
  })

  it('adds the house payment and a life event of the same year into one step', () => {
    const both = points({ lifeEvents: [{ year: 8, amountCents: -1_000_000, label: 'Car' }] })
    const payment = Math.round(32_435_282 * 0.2) + 600_000
    expect(both[8]!.preEventInvestedCents - both[8]!.investedCents).toBe(payment + 1_000_000)
  })

  it('has no step in year 0, where the plan starts', () => {
    const p = points({ housePurchaseYear: 0 })
    expect(p[0]!.preEventInvestedCents).toBe(p[0]!.investedCents)
  })

  it('is what the purchase breakdown calls the amount before the purchase', () => {
    const params = scenarioToParams(samplePlan(), SAMPLE_INFLATION)
    const breakdown = purchaseYearBreakdown(params, 8)!
    expect(breakdown.beforePurchaseCents).toBe(projectNetWorth(params)[8]!.preEventInvestedCents)
    expect(breakdown.startInvestedCents + breakdown.growthCents + breakdown.contributionCents).toBe(breakdown.beforePurchaseCents)
  })
})
