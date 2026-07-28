import { describe, expect, it } from 'vitest'
import { makeDataset, makeScenario } from './factories'

describe('makeDataset', () => {
  it('returns a valid empty dataset', () => {
    const ds = makeDataset()
    expect(ds.categories).toEqual([])
    expect(ds.wealthAccounts).toEqual([])
    expect(ds.wealthCheckins).toEqual([])
    expect(ds.goalScenarios).toEqual([])
  })

  it('merges overrides', () => {
    const ds = makeDataset({ wealthAccounts: [{ id: 1, name: 'X', kind: 'cash', sortOrder: 0, archived: false }] })
    expect(ds.wealthAccounts).toHaveLength(1)
    expect(ds.categories).toEqual([])
  })
})

describe('makeScenario', () => {
  it('returns a valid scenario with planStartDate null by default', () => {
    const s = makeScenario()
    expect(s.id).toBe(1)
    expect(s.planStartDate).toBeNull()
    expect(s.expectedRealReturn).toBe(0.07)
  })

  it('merges overrides', () => {
    const s = makeScenario({ planStartDate: '2024-01-01', name: 'Custom' })
    expect(s.planStartDate).toBe('2024-01-01')
    expect(s.name).toBe('Custom')
  })
})
