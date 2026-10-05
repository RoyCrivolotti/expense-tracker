import { describe, expect, it } from 'vitest'
import type { OverviewKpis } from '../../../engine'
import { buildTrendModel } from './trendChartModel'

function series(month: string, spendCents: number, incomeCents: number): OverviewKpis['series'][number] {
  return {
    month,
    totals: { incomeCents, spendCents, savedCents: incomeCents - spendCents, investedCents: 0, rate: null },
  }
}

describe('buildTrendModel', () => {
  it('shapes points, clamps unpaid to the spend, and averages spending', () => {
    const model = buildTrendModel(
      [series('2026-01', 100000, 300000), series('2026-02', 200000, 300000)],
      new Map([
        ['2026-01', 30000],
        ['2026-02', 999999],
      ]),
    )
    expect(model.points[0]).toMatchObject({ month: '2026-01', spendCents: 100000, unpaidCents: 30000 })
    // Unpaid can never exceed the month's spend.
    expect(model.points[1]?.unpaidCents).toBe(200000)
    expect(model.avgSpendCents).toBe(150000)
    expect(model.maxVal).toBeGreaterThanOrEqual(300000)
  })

  it('never draws negative bars for refund-heavy months', () => {
    const model = buildTrendModel([series('2026-01', -5000, 0)], new Map())
    expect(model.points[0]?.spendCents).toBe(0)
    expect(model.avgSpendCents).toBe(0)
  })
})
