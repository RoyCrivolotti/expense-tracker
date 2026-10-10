import { describe, expect, it } from 'vitest'
import { planGapLabel } from './planGap'

describe('planGapLabel', () => {
  it('counts months up to two years', () => {
    expect(planGapLabel(1)).toBe('1 month ahead')
    expect(planGapLabel(-7)).toBe('7 months behind')
    expect(planGapLabel(23)).toBe('23 months ahead')
  })

  it('switches to whole years past that, and says "more than" only when there are months over', () => {
    expect(planGapLabel(-85)).toBe('more than 7 years behind')
    expect(planGapLabel(41)).toBe('more than 3 years ahead')
    expect(planGapLabel(25)).toBe('more than 2 years ahead')
  })

  it('says exactly two years at 24 months, not more than two', () => {
    expect(planGapLabel(-24)).toBe('2 years behind')
    expect(planGapLabel(36)).toBe('3 years ahead')
  })
})
