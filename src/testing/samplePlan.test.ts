import { describe, expect, it } from 'vitest'
import { SAMPLE_INFLATION, SAMPLE_MILESTONES, samplePlan } from './samplePlan'

// Descriptions of this repository quote the sample plan, so its defining figures are pinned here.
describe('samplePlan', () => {
  it('is the plan the docs and pull request descriptions describe', () => {
    const plan = samplePlan()
    expect(plan).toMatchObject({
      startInvestedCents: 5_000_000,
      monthlyContributionCents: 100_000,
      expectedRealReturn: 0.05,
      horizonYears: 30,
      planStartDate: '2026-01-01',
      housePriceCents: 30_000_000,
      downPaymentFraction: 0.2,
      transactionCostsCents: 600_000,
      housePurchaseYear: 8,
      mortgageTermYears: 25,
      mortgageRateAnnual: 0.03,
      houseAppreciationRate: 0.03,
      rentMonthlyCents: 100_000,
      annualSpendCents: 3_000_000,
      safeWithdrawalRate: 0.04,
    })
    expect(SAMPLE_INFLATION).toBe(0.02)
  })

  it('takes overrides, so an example can change one thing', () => {
    expect(samplePlan({ housePurchaseYear: null }).housePurchaseYear).toBeNull()
  })

  it('has four milestones, nearest first', () => {
    const amounts = SAMPLE_MILESTONES.map((m) => m.amountCents)
    expect(amounts).toEqual([10_000_000, 25_000_000, 50_000_000, 100_000_000])
  })
})
