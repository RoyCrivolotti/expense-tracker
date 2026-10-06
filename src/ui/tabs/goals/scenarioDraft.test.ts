import { describe, expect, it } from 'vitest'
import { differsFrom, editedKeys, editedPatch, hasDetachedEdits, rebaseDraft, scenarioToDraft } from './scenarioDraft'
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

describe('editedKeys and editedPatch', () => {
  const saved = makeScenario({ id: 1 })

  it('name only what the draft changed', () => {
    const draft = { ...scenarioToDraft(saved), name: 'Renamed', horizonYears: saved.horizonYears + 5 }

    expect(editedKeys(draft, saved).sort()).toEqual(['horizonYears', 'name'])
    expect(editedPatch(draft, saved)).toEqual({ name: 'Renamed', horizonYears: saved.horizonYears + 5 })
  })

  it('count life events, which are compared whole, as one key', () => {
    const draft = { ...scenarioToDraft(saved), lifeEvents: [{ year: 3, amountCents: 1, label: 'Windfall' }] }

    expect(editedPatch(draft, saved)).toEqual({ lifeEvents: draft.lifeEvents })
  })

  it('count the schedule of monthly changes, compared whole like life events, so Save writes it', () => {
    const steps = [{ from: '2028-03', monthlyCents: 250_000 }]
    const draft = { ...scenarioToDraft(saved), contributionSchedule: steps }

    expect(differsFrom(draft, saved)).toBe(true)
    expect(editedKeys(draft, saved)).toEqual(['contributionSchedule'])
    expect(editedPatch(draft, saved)).toEqual({ contributionSchedule: steps })
    // Edited back to what is saved, it is not an edit.
    expect(differsFrom({ ...draft, contributionSchedule: [] }, saved)).toBe(false)
  })

  it('read a scenario cached before the schedule existed as having no changes', () => {
    const { contributionSchedule: _omitted, ...cached } = saved
    void _omitted

    expect(differsFrom(scenarioToDraft(saved), cached as typeof saved)).toBe(false)
    expect(differsFrom({ ...scenarioToDraft(saved), contributionSchedule: [{ from: '2028-03', monthlyCents: 1 }] }, cached as typeof saved)).toBe(true)
  })

  it('are empty for a draft straight from its scenario', () => {
    expect(editedKeys(scenarioToDraft(saved), saved)).toEqual([])
    expect(editedPatch(scenarioToDraft(saved), saved)).toEqual({})
  })
})

describe('rebaseDraft', () => {
  const from = makeScenario({ id: 1, startInvestedCents: 100_000, monthlyContributionCents: 5_000 })
  // Another device changed the start balance and the date it counts from.
  const onto = { ...from, startInvestedCents: 900_000, planStartDate: '2027-01-01' }

  it('turns a clean draft into the scenario as it is now', () => {
    expect(rebaseDraft(scenarioToDraft(from), from, onto)).toEqual(scenarioToDraft(onto))
  })

  it('keeps what was edited here and takes the rest from the new row', () => {
    const mine = { ...scenarioToDraft(from), monthlyContributionCents: 7_000 }

    const rebased = rebaseDraft(mine, from, onto)

    expect(rebased.monthlyContributionCents).toBe(7_000)
    expect(rebased.startInvestedCents).toBe(900_000)
    expect(rebased.planStartDate).toBe('2027-01-01')
    expect(editedKeys(rebased, onto)).toEqual(['monthlyContributionCents'])
  })
})
