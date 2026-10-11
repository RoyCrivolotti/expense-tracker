import { describe, expect, it } from 'vitest'
import { makeScenario } from '../../testing/factories'
import { SCENARIO_NAME_MAX_LENGTH } from './projectionConstants'
import { copyName, duplicateScenario, pickScenarioColor, saveAsNewName } from './projectionPresets'

describe('copyName', () => {
  it('adds "(copy)" to a name that has none', () => {
    expect(copyName('Path A')).toBe('Path A (copy)')
  })

  it('counts a copy of a copy up instead of stacking the suffix', () => {
    expect(copyName('Path A (copy)')).toBe('Path A (copy 2)')
    expect(copyName('Path A (copy 2)')).toBe('Path A (copy 3)')
    expect(copyName('Path A (copy 9)')).toBe('Path A (copy 10)')
  })

  it('counts on past the copies that already exist', () => {
    expect(copyName('Path A', ['Path A', 'Path A (copy)'])).toBe('Path A (copy 2)')
    expect(copyName('Path A (copy)', ['Path A (copy 2)', 'Path A (copy 3)'])).toBe('Path A (copy 4)')
    expect(copyName('Path A', ['Path B (copy)'])).toBe('Path A (copy)')
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
    const copy = duplicateScenario(source, 3, ['#6366f1'], ['Path A (copy)'])

    expect(copy.name).toBe('Path A (copy 2)')
    expect(copy.sortOrder).toBe(3)
    expect(copy.expectedRealReturn).toBe(0.05)
    expect(copy.color).toBe(pickScenarioColor(['#6366f1']))
    expect(copy.color).not.toBe('#6366f1')
  })
})

describe('names at the length limit', () => {
  const long = 'x'.repeat(SCENARIO_NAME_MAX_LENGTH)

  it('cuts the base so a copy of a 100-character name still fits', () => {
    const copy = copyName(long)
    expect(copy.length).toBeLessThanOrEqual(SCENARIO_NAME_MAX_LENGTH)
    expect(copy.endsWith(' (copy)')).toBe(true)
  })

  it('counts on from a long copy without growing past the limit', () => {
    const first = copyName(long)
    const second = copyName(first, [first])
    expect(second.length).toBeLessThanOrEqual(SCENARIO_NAME_MAX_LENGTH)
    expect(second.endsWith(' (copy 2)')).toBe(true)
  })

  it('keeps the whole name when it fits', () => {
    expect(copyName('Path A')).toBe('Path A (copy)')
    expect(saveAsNewName('Path A')).toBe('Path A copy')
  })

  it('cuts the Save as new default to fit', () => {
    const name = saveAsNewName(long)
    expect(name.length).toBeLessThanOrEqual(SCENARIO_NAME_MAX_LENGTH)
    expect(name.endsWith(' copy')).toBe(true)
  })
})
