import { describe, expect, it } from 'vitest'
import { averageMonthlyCents, medianMonthlyCents, monthlyFlows, monthsSincePlanStart, paceMonths, type MonthlyFlow } from './goals'
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

describe('paceMonths', () => {
  const flows = [flow('2026-01', 1000), flow('2026-02', 1000), flow('2026-03', 1000), flow('2026-04', 833)]
  const months = (result: ReturnType<typeof paceMonths>) => result.months.map((f) => f.month)

  it('leaves out the month still under way', () => {
    // Someone investing on the 25th has put in 833 of 1.000 by the 24th: not a month behind.
    const result = paceMonths(flows, '2026-01-10', '2026-04')
    expect(months(result)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(averageMonthlyCents(result.months.map((f) => f.investedCents))).toBe(1000)
  })

  it('keeps every recorded month when no month is under way', () => {
    expect(months(paceMonths(flows, '2026-01-10', undefined))).toHaveLength(4)
  })

  it('counts a month inside the record with no transactions as a month of nothing invested', () => {
    const gap = [flow('2026-01', 1000), flow('2026-03', 1000)]
    const result = paceMonths(gap, null, undefined)
    expect(months(result)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(result.months[1]).toEqual({ month: '2026-02', netSavingCents: 0, investedCents: 0 })
  })

  it('does not count months before the first recorded one, which are unknown rather than empty', () => {
    const result = paceMonths(flows.slice(2), '2026-01-10', undefined)
    expect(months(result)).toEqual(['2026-03', '2026-04'])
    expect(result.sincePlanStart).toBe(false)
  })

  it('starts at the plan start month, whatever the day, and says they are the plan\'s own', () => {
    const result = paceMonths(flows, '2026-02-17', '2026-04')
    expect(months(result)).toEqual(['2026-02', '2026-03'])
    expect(result.sincePlanStart).toBe(true)
  })

  it('crosses a year end without skipping a month', () => {
    const across = [flow('2025-11', 1), flow('2026-02', 1)]
    expect(months(paceMonths(across, null, undefined))).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('has no pace to judge when the plan started after the last whole month', () => {
    expect(paceMonths(flows, '2026-04-02', '2026-04')).toEqual({ months: [], sincePlanStart: true })
    expect(paceMonths(flows, '2026-09-01', undefined)).toEqual({ months: [], sincePlanStart: true })
  })

  it('has nothing without a whole month on record, and does not claim a start it has not got', () => {
    expect(paceMonths([flow('2026-04', 5)], null, '2026-04')).toEqual({ months: [], sincePlanStart: false })
    expect(paceMonths([], '2026-01-01', undefined)).toEqual({ months: [], sincePlanStart: true })
  })
})
