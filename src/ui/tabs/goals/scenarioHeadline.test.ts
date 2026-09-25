import { describe, expect, it } from 'vitest'
import type { GoalScenario } from '../../../types'
import { scenarioHeadline } from './scenarioHeadline'
import { DEFAULT_INFLATION_RATE, planFromToday } from '../../../engine'

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
  planStartDate: null,
  lifeEvents: [],
  isActive: false,
}

describe('scenarioHeadline', () => {
  it('includes short name and FI year in primary line', () => {
    const { primary } = scenarioHeadline(base, DEFAULT_INFLATION_RATE)
    expect(primary).toMatch(/^Rent & invest/)
    expect(primary).toContain('FI year')
  })

  it('adds the FI year counted from today when the plan is restarted from a check-in', () => {
    const plan = { ...base, planStartDate: '2024-01-01', isActive: true }
    const fromToday = planFromToday(plan, { investedCents: 900_000_00, date: '2026-01-01' })
    const { primary } = scenarioHeadline(plan, DEFAULT_INFLATION_RATE, undefined, undefined, fromToday)
    expect(primary).toMatch(/from today, FI in \d+ years$/)
    // Already past the target at today's balance.
    const rich = planFromToday(plan, { investedCents: 2_000_000_00, date: '2026-01-01' })
    expect(scenarioHeadline(plan, DEFAULT_INFLATION_RATE, undefined, undefined, rich).primary).toMatch(/FI at today's balance$/)
    expect(scenarioHeadline(plan, DEFAULT_INFLATION_RATE).primary).not.toContain('from today')
  })

  it('shows plan and actual saving when they differ', () => {
    const { secondary } = scenarioHeadline(base, DEFAULT_INFLATION_RATE, 72_000)
    expect(secondary).toContain('plan ')
    expect(secondary).toContain('/mo')
    expect(secondary).toContain('actual avg')
  })

  it('omits actual avg when it matches plan', () => {
    const { secondary } = scenarioHeadline(base, DEFAULT_INFLATION_RATE, 100_000)
    expect(secondary).not.toContain('actual avg')
  })
})
