import { describe, expect, it } from 'vitest'
import type { GoalScenario } from '../../../types'
import { scenarioHeadline } from './scenarioHeadline'

const base: GoalScenario = {
  id: 1,
  name: 'Rent & invest: baseline',
  color: '#2563eb',
  sortOrder: 0,
  startInvestedCents: 500_000_00,
  monthlyContributionCents: 100_000,
  annualContributionGrowth: 0,
  expectedRealReturn: 0.06,
  horizonYears: 30,
  housePriceCents: 0,
  downPaymentFraction: 0.2,
  housePurchaseYear: null,
  transactionCostsCents: 0,
  mortgageTermYears: 30,
  mortgageRateAnnual: 0.04,
  houseAppreciationRate: 0.02,
  rentMonthlyCents: 150_000,
  annualSpendCents: 50_000_00,
  safeWithdrawalRate: 0.04,
}

describe('scenarioHeadline', () => {
  it('includes short name and FI year in primary line', () => {
    const { primary } = scenarioHeadline(base)
    expect(primary).toMatch(/^Rent & invest/)
    expect(primary).toContain('FI year')
  })

  it('shows plan and actual saving when they differ', () => {
    const { secondary } = scenarioHeadline(base, 72_000)
    expect(secondary).toContain('plan ')
    expect(secondary).toContain('/mo')
    expect(secondary).toContain('actual avg')
  })

  it('omits actual avg when it matches plan', () => {
    const { secondary } = scenarioHeadline(base, 100_000)
    expect(secondary).not.toContain('actual avg')
  })
})
