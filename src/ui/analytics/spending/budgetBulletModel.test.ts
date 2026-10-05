import { describe, expect, it } from 'vitest'
import type { SpendingGroupRow } from '../../../engine'
import { buildBulletModel } from './budgetBulletModel'

function row(partial: Partial<SpendingGroupRow>): SpendingGroupRow {
  return {
    key: '1',
    name: 'Groceries',
    currentCents: 20000,
    unpaidCents: 0,
    budgetCents: 40000,
    shouldBeTodayCents: null,
    spark: [],
    avg3Cents: null,
    txnCount: 3,
    ...partial,
  }
}

describe('buildBulletModel', () => {
  it('is null without a budget — the sparkline shows instead', () => {
    expect(buildBulletModel(row({ budgetCents: null }))).toBeNull()
    expect(buildBulletModel(row({ budgetCents: 0 }))).toBeNull()
  })

  it('tracks the budget when under it, with the pace tick in place', () => {
    const m = buildBulletModel(row({ currentCents: 20000, shouldBeTodayCents: 10000 }))!
    expect(m.paidPct).toBe(50)
    expect(m.budgetTickPct).toBeNull()
    expect(m.paceTickPct).toBe(25)
    expect(m.state).toBe('warn')
  })

  it('marks the budget inside the bar when the spend overflows', () => {
    const m = buildBulletModel(row({ currentCents: 50000 }))!
    expect(m.state).toBe('over')
    expect(m.paidPct).toBe(100)
    expect(m.budgetTickPct).toBe(80)
  })

  it('stacks the hatched unpaid share after the paid share', () => {
    const m = buildBulletModel(row({ currentCents: 20000, unpaidCents: 8000 }))!
    expect(m.paidPct).toBe(30)
    expect(m.unpaidPct).toBe(20)
    expect(m.state).toBe('ok')
  })
})
