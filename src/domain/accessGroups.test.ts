import { describe, expect, it } from 'vitest'
import { filterByGroupAccess, hasGroupGrant } from './accessGroups'

describe('accessGroups', () => {
  const grants = {
    expenses: true,
    finance: false,
    legacy: true,
    oncall: false,
  }

  it('hasGroupGrant reflects grant map', () => {
    expect(hasGroupGrant(grants, 'expenses')).toBe(true)
    expect(hasGroupGrant(grants, 'finance')).toBe(false)
  })

  it('filterByGroupAccess omits denied groups', () => {
    const items = [
      { id: 'a', groupId: 'expenses' as const },
      { id: 'b', groupId: 'finance' as const },
      { id: 'c', groupId: 'legacy' as const },
    ]
    expect(filterByGroupAccess(items, grants).map((item) => item.id)).toEqual(['a', 'c'])
  })
})
