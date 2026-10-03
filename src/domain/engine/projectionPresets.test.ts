import { describe, expect, it } from 'vitest'
import { makeScenario } from '../../testing/factories'
import { copyName, duplicateScenario, pickScenarioColor } from './projectionPresets'

describe('copyName', () => {
  it('adds "(copy)" to a name that has none', () => {
    expect(copyName('Path A')).toBe('Path A (copy)')
  })

  it('counts a copy of a copy up instead of stacking the suffix', () => {
    expect(copyName('Path A (copy)')).toBe('Path A (copy 2)')
    expect(copyName('Path A (copy 2)')).toBe('Path A (copy 3)')
    expect(copyName('Path A (copy 9)')).toBe('Path A (copy 10)')
  })

  it('leaves a name that only mentions a copy alone', () => {
    expect(copyName('My copy plan')).toBe('My copy plan (copy)')
    expect(copyName('Path A (copy) later')).toBe('Path A (copy) later (copy)')
  })
})

describe('duplicateScenario', () => {
  it('keeps the inputs, names it as a copy, puts it where it is told and gives it a free colour', () => {
    const { id, ...source } = makeScenario({ name: 'Path A', color: '#6366f1', expectedRealReturn: 0.05 })
    void id
    const copy = duplicateScenario(source, 3, ['#6366f1'])

    expect(copy.name).toBe('Path A (copy)')
    expect(copy.sortOrder).toBe(3)
    expect(copy.expectedRealReturn).toBe(0.05)
    expect(copy.color).toBe(pickScenarioColor(['#6366f1']))
    expect(copy.color).not.toBe('#6366f1')
  })
})
