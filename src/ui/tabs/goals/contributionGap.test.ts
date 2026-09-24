import { describe, expect, it } from 'vitest'
import { contributionGapLabel } from './contributionGap'

describe('contributionGapLabel', () => {
  it('counts months up to two years', () => {
    expect(contributionGapLabel(1)).toBe('1 month ahead')
    expect(contributionGapLabel(-7)).toBe('7 months behind')
    expect(contributionGapLabel(23)).toBe('23 months ahead')
  })

  it('switches to whole years past that, since the engine clamps the count at the horizon', () => {
    expect(contributionGapLabel(-24)).toBe('more than 2 years behind')
    expect(contributionGapLabel(-360)).toBe('more than 30 years behind')
    expect(contributionGapLabel(41)).toBe('more than 3 years ahead')
  })
})
