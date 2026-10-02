import { describe, expect, it } from 'vitest'
import { fillOf } from './sliderFill'

const fill = (value: number, min: number, max: number) => (fillOf(value, min, max) as Record<string, string>)['--fill']

describe('fillOf', () => {
  it('is the share of the range the value is along', () => {
    expect(fill(0.07, 0, 0.2)).toBe('35%')
    expect(fill(15, 10, 30)).toBe('25%')
  })

  it('counts a range that starts below zero from its start', () => {
    expect(fill(-1, -1, 9)).toBe('0%')
    expect(fill(4, -1, 9)).toBe('50%')
  })

  it('stays at an end for a value outside the range or a range with no length', () => {
    expect(fill(50, 0, 10)).toBe('100%')
    expect(fill(-5, 0, 10)).toBe('0%')
    expect(fill(3, 3, 3)).toBe('0%')
  })
})
