import { describe, expect, it } from 'vitest'
import { differsFrom, hasDetachedEdits, scenarioToDraft } from './scenarioDraft'
import { makeScenario } from '../../../testing/factories'

describe('scenarioToDraft', () => {
  it('leaves out the row identity and keeps the rest', () => {
    const draft = scenarioToDraft(makeScenario({ id: 7, isActive: true, name: 'Path A' }))

    expect(draft).not.toHaveProperty('id')
    expect(draft).not.toHaveProperty('isActive')
    expect(draft.name).toBe('Path A')
  })
})

describe('differsFrom', () => {
  const saved = makeScenario({ id: 1 })

  it('is false for a draft straight from its scenario', () => {
    expect(differsFrom(scenarioToDraft(saved), saved)).toBe(false)
  })

  it('ignores where the scenario sits in the list', () => {
    expect(differsFrom({ ...scenarioToDraft(saved), sortOrder: saved.sortOrder + 1 }, saved)).toBe(false)
  })

  it('sees an edit to the name, a control, the colour or the life events', () => {
    const draft = scenarioToDraft(saved)

    expect(differsFrom({ ...draft, name: 'Renamed' }, saved)).toBe(true)
    expect(differsFrom({ ...draft, monthlyContributionCents: draft.monthlyContributionCents + 1 }, saved)).toBe(true)
    expect(differsFrom({ ...draft, color: '#000000' }, saved)).toBe(true)
    expect(
      differsFrom({ ...draft, lifeEvents: [{ year: 3, amountCents: 1, label: 'Windfall' }] }, saved),
    ).toBe(true)
  })
})

describe('hasDetachedEdits', () => {
  const origin = makeScenario({ id: 1 })
  const edited = { ...scenarioToDraft(origin), name: 'Edited' }

  it('is true for a detached draft that differs from where it came from', () => {
    expect(hasDetachedEdits(null, origin, edited)).toBe(true)
  })

  it('is false for a detached draft that matches where it came from, or came from nowhere', () => {
    expect(hasDetachedEdits(null, origin, scenarioToDraft(origin))).toBe(false)
    expect(hasDetachedEdits(null, null, edited)).toBe(false)
  })

  it('is false while a scenario is loaded, which has its own dirty check', () => {
    expect(hasDetachedEdits(origin, origin, edited)).toBe(false)
  })
})
