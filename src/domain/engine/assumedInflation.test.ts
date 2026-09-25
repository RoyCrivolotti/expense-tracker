import { describe, expect, it } from 'vitest'
import { INFLATION_MAX, INFLATION_MIN, assumedInflationError } from './assumedInflation'
import { DEFAULT_INFLATION_RATE } from './projectionConstants'

describe('assumedInflationError', () => {
  it('accepts the default, both bounds and a value between', () => {
    for (const ok of [DEFAULT_INFLATION_RATE, INFLATION_MIN, INFLATION_MAX, 0.035]) {
      expect(assumedInflationError(ok)).toBeNull()
    }
  })

  it('refuses anything outside the bounds, and anything that is not a number', () => {
    for (const bad of [-0.001, 0.101, 1, NaN, Infinity, '0.02', null, undefined, {}]) {
      expect(assumedInflationError(bad)).toMatch(/assumedInflation must be a number between 0 and 0.1/)
    }
  })
})
