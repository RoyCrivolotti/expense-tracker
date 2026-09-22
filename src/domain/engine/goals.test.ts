import { describe, expect, it } from 'vitest'
import type { GoalInputs } from '../types'
import { pmt } from './finance'
import { averageMonthlySaving, computeGoals } from './goals'

const sampleInputs: GoalInputs = {
  housePriceCents: 400_000_000,
  downPaymentFraction: 0.4,
  mortgageTermYears: 30,
  mortgageRateAnnual: 0.02,
  longTermTargetCents: 150_000_000,
  horizonYears: 10,
  expectedRealReturn: 0.05,
}

describe('computeGoals', () => {
  it('derives down payment, loan, and mortgage from house inputs', () => {
    const goals = computeGoals(sampleInputs, 200000, 5000000)
    expect(goals.downPaymentCents).toBe(160_000_000)
    expect(goals.loanAmountCents).toBe(240_000_000)
    expect(goals.monthlyMortgageCents).toBeCloseTo(
      pmt(0.02 / 12, 360, 240_000_000),
      -2,
    )
  })

  it('projects portfolio and time-to-target from savings and net worth', () => {
    const goals = computeGoals(sampleInputs, 200_000, 8_000_000)
    expect(goals.projectedPortfolioCents).toBeGreaterThan(goals.liquidNetWorthCents)
    expect(goals.yearsToLongTermGoal).toBeGreaterThan(0)
    expect(goals.surplusCents).toBe(
      goals.projectedPortfolioCents - sampleInputs.longTermTargetCents,
    )
  })

  it('returns zero months to down payment when net worth already covers it', () => {
    const goals = computeGoals(sampleInputs, 100_000, 170_000_000)
    expect(goals.monthsToDownPayment).toBe(0)
  })

  it('returns Infinity months when savings are zero and target not met', () => {
    const goals = computeGoals(sampleInputs, 0, 1000000)
    expect(goals.monthsToDownPayment).toBe(Infinity)
  })
})

describe('averageMonthlySaving', () => {
  it('returns zero for an empty month list', () => {
    expect(averageMonthlySaving([])).toBe(0)
  })

  it('rounds the mean net saving across months', () => {
    expect(averageMonthlySaving([100000, 200000, 300000])).toBe(200000)
    expect(averageMonthlySaving([100001, 100002])).toBe(100002)
  })
})
