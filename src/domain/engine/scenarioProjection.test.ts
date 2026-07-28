import { describe, expect, it } from 'vitest'
import { projectNetWorthBand, scenarioToParams } from './scenarioProjection'
import { makeScenario } from '../../testing/factories'

describe('projectNetWorthBand', () => {
  it('returns lo and hi arrays of the same length', () => {
    const params = scenarioToParams(makeScenario())
    const { lo, hi } = projectNetWorthBand(params)
    expect(lo.length).toBe(hi.length)
    expect(lo.length).toBeGreaterThan(0)
  })

  it('hi values are always >= lo values', () => {
    const params = scenarioToParams(makeScenario())
    const { lo, hi } = projectNetWorthBand(params)
    lo.forEach((loVal, i) => {
      expect(hi[i]).toBeGreaterThanOrEqual(loVal)
    })
  })

  it('band widens as years progress', () => {
    const params = scenarioToParams(makeScenario())
    const { lo, hi } = projectNetWorthBand(params)
    const firstSpread = (hi[0] ?? 0) - (lo[0] ?? 0)
    const lastSpread = (hi[hi.length - 1] ?? 0) - (lo[lo.length - 1] ?? 0)
    expect(lastSpread).toBeGreaterThan(firstSpread)
  })

  it('clamps lo to 0 when spread exceeds expectedRealReturn', () => {
    const params = scenarioToParams(makeScenario({ expectedRealReturn: 0.01 }))
    const { lo } = projectNetWorthBand(params, 0.05)
    lo.forEach((v) => expect(v).toBeGreaterThanOrEqual(0))
  })

  it('respects custom spread parameter', () => {
    const params = scenarioToParams(makeScenario())
    const narrow = projectNetWorthBand(params, 0.01)
    const wide = projectNetWorthBand(params, 0.05)
    const lastIdx = narrow.lo.length - 1
    const narrowSpread = (narrow.hi[lastIdx] ?? 0) - (narrow.lo[lastIdx] ?? 0)
    const wideSpread = (wide.hi[lastIdx] ?? 0) - (wide.lo[lastIdx] ?? 0)
    expect(wideSpread).toBeGreaterThan(narrowSpread)
  })
})
