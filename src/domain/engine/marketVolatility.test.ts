import { describe, expect, it } from 'vitest'
import { DEFAULT_MARKET_VOLATILITY, MARKET_VOLATILITY_MAX, MARKET_VOLATILITY_MIN, MARKET_VOLATILITY_PRESETS, marketVolatilityError } from './marketVolatility'

describe('marketVolatilityError', () => {
  it('accepts the default, both bounds and a value between', () => {
    for (const ok of [DEFAULT_MARKET_VOLATILITY, MARKET_VOLATILITY_MIN, MARKET_VOLATILITY_MAX, 0.11, 0.2]) {
      expect(marketVolatilityError(ok)).toBeNull()
    }
  })

  it('refuses anything outside the bounds, and anything that is not a number', () => {
    for (const bad of [-0.001, 0.501, 1, NaN, Infinity, '0.15', null, undefined, {}]) {
      expect(marketVolatilityError(bad)).toMatch(/marketVolatility must be a number between 0 and 0.5/)
    }
  })

  it('is 15% until it is set, which is what world stocks have done a year', () => {
    expect(DEFAULT_MARKET_VOLATILITY).toBe(0.15)
  })

  it('has presets from the usual one down, each inside the bounds, the first the default', () => {
    expect(MARKET_VOLATILITY_PRESETS.map((p) => p.value)).toEqual([0.15, 0.11, 0.07])
    expect(MARKET_VOLATILITY_PRESETS[0].value).toBe(DEFAULT_MARKET_VOLATILITY)
    for (const preset of MARKET_VOLATILITY_PRESETS) expect(marketVolatilityError(preset.value)).toBeNull()
  })
})
