import { describe, expect, it } from 'vitest'
import { getExpenseHubNavItems } from './hubNavItems'

describe('getExpenseHubNavItems', () => {
  it('includes catalyst calendar for finance grant', () => {
    const items = getExpenseHubNavItems({
      expenses: true,
      finance: true,
      legacy: true,
      oncall: true,
    })
    expect(items.some((item) => item.label === 'Catalyst calendar')).toBe(true)
  })
})
