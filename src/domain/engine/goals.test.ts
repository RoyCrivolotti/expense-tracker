import { describe, expect, it } from 'vitest'
import { averageMonthlyCents, medianMonthlyCents, monthlyFlows, monthsSincePlanStart, type MonthlyFlow } from './goals'
import type { MonthlyTotals } from './monthlyTotals'

function totals(month: string, netSavingCents: number, investmentsCents: number): MonthlyTotals {
  return {
    month,
    incomeCents: 0,
    expensesCents: 0,
    investmentsCents,
    contributionsCents: Math.max(0, investmentsCents),
    netSavingCents,
    netExpenseByAccount: new Map(),
    cashMovementCents: 0,
  }
}

const flow = (month: string, investedCents: number): MonthlyFlow => ({
  month,
  netSavingCents: investedCents * 3,
  investedCents,
})

describe('averageMonthlyCents', () => {
  it('returns zero for an empty month list', () => {
    expect(averageMonthlyCents([])).toBe(0)
  })

  it('rounds the mean across months', () => {
    expect(averageMonthlyCents([100000, 200000, 300000])).toBe(200000)
    expect(averageMonthlyCents([100001, 100002])).toBe(100002)
  })
})

describe('medianMonthlyCents', () => {
  it('returns zero for an empty month list', () => {
    expect(medianMonthlyCents([])).toBe(0)
  })

  it('sets a one-off lump sum aside, which the mean cannot', () => {
    // Eleven months of 1,000 and one of 50,000: the mean says 5,083 a month, the median 1,000.
    const months = [...Array.from({ length: 11 }, () => 100_000), 5_000_000]
    expect(averageMonthlyCents(months)).toBe(508_333)
    expect(medianMonthlyCents(months)).toBe(100_000)
  })

  it('takes the middle month, or the mean of the two middle ones', () => {
    expect(medianMonthlyCents([300, 100, 200])).toBe(200)
    expect(medianMonthlyCents([100, 400, 200, 300])).toBe(250)
  })
})

describe('monthlyFlows', () => {
  it('keeps net saving and investing apart, oldest month first', () => {
    const map = new Map([
      ['2026-03', totals('2026-03', 285_695, 40_000)],
      ['2026-01', totals('2026-01', 100_000, 50_000)],
    ])
    expect(monthlyFlows(map)).toEqual([
      { month: '2026-01', netSavingCents: 100_000, investedCents: 50_000 },
      { month: '2026-03', netSavingCents: 285_695, investedCents: 40_000 },
    ])
  })
})

describe('monthsSincePlanStart', () => {
  const flows = [flow('2026-01', 1), flow('2026-02', 2), flow('2026-03', 3)]

  it('starts at the plan start month, whatever the day', () => {
    expect(monthsSincePlanStart(flows, '2026-02-17').map((f) => f.month)).toEqual([
      '2026-02',
      '2026-03',
    ])
  })

  it('counts every month when the plan has no start date', () => {
    expect(monthsSincePlanStart(flows, null)).toBe(flows)
  })

  it('counts every month when the plan started after the last recorded one', () => {
    expect(monthsSincePlanStart(flows, '2026-09-01')).toBe(flows)
  })
})
