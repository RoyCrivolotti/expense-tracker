import { describe, expect, it } from 'vitest'
import { DEFAULT_LEVERS, LEVER_KEYS, MAX_LEVERS, isLeverKey } from './goalLevers'

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
    expect(LEVER_KEYS).toHaveLength(15)
  })
})
