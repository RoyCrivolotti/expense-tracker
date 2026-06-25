import { describe, expect, it } from 'vitest'
import type { GoalScenario } from '../../../types'
import { lastAddedScenario, resolveDashboardScenario } from './scenarioSelection'

function scenario(id: number, sortOrder: number): GoalScenario {
  return {
    id,
    name: `Plan ${id}`,
    color: '#000',
    sortOrder,
    startInvestedCents: 0,
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
    rentMonthlyCents: 0,
    annualSpendCents: 50_000_00,
    safeWithdrawalRate: 0.04,
  }
}

describe('lastAddedScenario', () => {
  it('returns null when empty', () => {
    expect(lastAddedScenario([])).toBeNull()
  })

  it('picks highest sortOrder then id', () => {
    const scenarios = [scenario(1, 0), scenario(3, 2), scenario(2, 1)]
    expect(lastAddedScenario(scenarios)?.id).toBe(3)
  })
})

describe('resolveDashboardScenario', () => {
  it('falls back to last added when nothing pinned', () => {
    const scenarios = [scenario(1, 0), scenario(2, 1)]
    expect(resolveDashboardScenario(scenarios)?.id).toBe(2)
  })
})
