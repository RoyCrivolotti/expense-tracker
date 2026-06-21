import { describe, expect, it } from 'vitest'
import { canUseExpenseTracker, getExpenseHubNavItems } from './hubNavItems'

describe('expense hub navigation (group grants)', () => {
  it('hides all admin links when only expenses is granted', () => {
    const items = getExpenseHubNavItems({
      expenses: true,
      finance: false,
      legacy: false,
    })
    expect(items.map((item) => item.label)).toEqual(['Expense Tracker'])
  })

  it('shows finance and legacy admin links when those groups are granted', () => {
    const items = getExpenseHubNavItems({
      expenses: false,
      finance: true,
      legacy: true,
    })
    expect(items.map((item) => item.label)).toEqual([
      'Hub',
      'Investment Constitution',
      'Strategy',
      'Investing Primer',
      'Legacy site (2019)',
    ])
  })

  it('reports expense tracker availability from grants', () => {
    expect(
      canUseExpenseTracker({ expenses: true, finance: false, legacy: false }),
    ).toBe(true)
    expect(
      canUseExpenseTracker({ expenses: false, finance: true, legacy: true }),
    ).toBe(false)
  })
})
