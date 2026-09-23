import { describe, expect, it } from 'vitest'
import { averageMonthlyCents, monthlyFlows, monthsSincePlanStart, type MonthlyFlow } from './goals'
import type { MonthlyTotals } from './monthlyTotals'

function totals(month: string, netSavingCents: number, investmentsCents: number): MonthlyTotals {
  return {
    month,
    incomeCents: 0,
    expensesCents: 0,
    investmentsCents,
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
