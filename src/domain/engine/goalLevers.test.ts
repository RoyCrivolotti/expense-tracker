import { describe, expect, it } from 'vitest'
import { DEFAULT_LEVERS, LEVER_KEYS, MAX_LEVERS, isLeverKey, leversError, parseLevers } from './goalLevers'

describe('goal levers', () => {
  it('starts from a full bar of distinct, known inputs', () => {
    expect(DEFAULT_LEVERS).toHaveLength(MAX_LEVERS)
    expect(new Set(DEFAULT_LEVERS).size).toBe(DEFAULT_LEVERS.length)
    expect(DEFAULT_LEVERS.every(isLeverKey)).toBe(true)
  })

  it('knows its keys and nothing else', () => {
    expect(isLeverKey('expectedRealReturn')).toBe(true)
    expect(isLeverKey('planStartDate')).toBe(false)
    expect(isLeverKey('lifeEvents')).toBe(false)
    expect(isLeverKey(7)).toBe(false)
    expect(LEVER_KEYS).toHaveLength(14)
  })
})

describe('leversError', () => {
  it('accepts a list of distinct inputs up to the size of the bar, and an empty one', () => {
    expect(leversError(['rentMonthlyCents'])).toBeNull()
    expect(leversError([...DEFAULT_LEVERS])).toBeNull()
    expect(leversError([])).toBeNull()
  })

  it('refuses what is not a list, a sixth input, an input a scenario does not have, and a repeat', () => {
    expect(leversError('rentMonthlyCents')).toMatch(/must be a list/)
    expect(leversError(null)).toMatch(/must be a list/)
    expect(leversError([...DEFAULT_LEVERS, 'rentMonthlyCents'])).toMatch(/at most 5/)
    expect(leversError(['planStartDate'])).toMatch(/not one a scenario has/)
    expect(leversError(['rentMonthlyCents', 'rentMonthlyCents'])).toMatch(/twice/)
  })
})

describe('parseLevers', () => {
  it('gives the defaults to an owner who never chose', () => {
    expect(parseLevers(null)).toEqual([...DEFAULT_LEVERS])
  })

  it('keeps a chosen list in the order it was saved, including an empty one', () => {
    expect(parseLevers('["rentMonthlyCents","horizonYears"]')).toEqual(['rentMonthlyCents', 'horizonYears'])
    expect(parseLevers('[]')).toEqual([])
  })

  it('falls back to the defaults for a damaged row', () => {
    expect(parseLevers('not json')).toEqual([...DEFAULT_LEVERS])
    expect(parseLevers('{"a":1}')).toEqual([...DEFAULT_LEVERS])
  })

  it('drops an input that no longer exists, a repeat and anything past the limit', () => {
    expect(parseLevers('["gone","rentMonthlyCents","rentMonthlyCents"]')).toEqual(['rentMonthlyCents'])
    const six = JSON.stringify([...LEVER_KEYS].slice(0, 6))
    expect(parseLevers(six)).toHaveLength(MAX_LEVERS)
  })

  it('drops the contribution growth input from a bar saved while it still existed', () => {
    expect(parseLevers('["annualContributionGrowth","rentMonthlyCents"]')).toEqual(['rentMonthlyCents'])
  })

  it('does not hand out the defaults themselves to be changed', () => {
    const first = parseLevers(null)
    first.pop()
    expect(parseLevers(null)).toHaveLength(MAX_LEVERS)
  })
})
