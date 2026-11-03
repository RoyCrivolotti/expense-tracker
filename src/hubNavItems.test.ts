import { describe, expect, it } from 'vitest'
import { getExpenseHubNavItems, lacksExpenseAccess } from './hubNavItems'

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

describe('lacksExpenseAccess', () => {
  const groups = { expenses: false, finance: true, legacy: false, oncall: false }

  it('is true for a listed person with groups and not Expenses', () => {
    expect(lacksExpenseAccess({ groups })).toBe(true)
  })

  it.each([
    ['the owner, whatever the groups', { groups, isOwner: true }],
    ['a person with the Expenses group', { groups: { ...groups, expenses: true } }],
    ['an answer that lists no groups', {}],
  ])('is false for %s', (_who, access) => {
    expect(lacksExpenseAccess(access)).toBe(false)
  })
})
