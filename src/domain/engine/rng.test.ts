import { describe, expect, it } from 'vitest'
import { boxMuller, mulberry32, normalDraws } from './rng'

describe('mulberry32', () => {
  it('gives the same numbers for the same seed, and others for another, all in [0, 1)', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    const c = mulberry32(8)
    const first = Array.from({ length: 5 }, () => a())
    expect(Array.from({ length: 5 }, () => b())).toEqual(first)
    expect(Array.from({ length: 5 }, () => c())).not.toEqual(first)
    const many = mulberry32(99)
    for (let i = 0; i < 10_000; i++) {
      const u = many()
      expect(u).toBeGreaterThanOrEqual(0)
      expect(u).toBeLessThan(1)
    }
  })
})

describe('boxMuller', () => {
  it('turns two uniforms into two independent standard normals', () => {
    const [z0, z1] = boxMuller(0.3, 0.7)
    const r = Math.sqrt(-2 * Math.log(1 - 0.3))
    expect(z0).toBeCloseTo(r * Math.cos(2 * Math.PI * 0.7), 12)
    expect(z1).toBeCloseTo(r * Math.sin(2 * Math.PI * 0.7), 12)
  })

  it('stays finite when a uniform is exactly zero, which would otherwise be a logarithm of nothing', () => {
    for (const [u1, u2] of [[0, 0], [0, 0.5], [0, 0.999999]] as const) {
      const [z0, z1] = boxMuller(u1, u2)
      expect(Number.isFinite(z0)).toBe(true)
      expect(Number.isFinite(z1)).toBe(true)
      expect(Math.abs(z0)).toBeLessThan(10)
    }
  })
})

describe('normalDraws', () => {
  it('is a year-major matrix of pairs x years, the same for the same seed', () => {
    const a = normalDraws(50, 10, 3)
    expect(a).toHaveLength(500)
    expect(Array.from(normalDraws(50, 10, 3))).toEqual(Array.from(a))
    expect(Array.from(normalDraws(50, 10, 4))).not.toEqual(Array.from(a))
  })

  it('has the same draw for the same pair and year whatever the number of years drawn, so a longer plan keeps the picture of a shorter one', () => {
    const short = normalDraws(40, 12, 9)
    const long = normalDraws(40, 30, 9)
    expect(Array.from(long.subarray(0, short.length))).toEqual(Array.from(short))
  })

  it('has the mean, spread and absence of correlation between years of standard normals', () => {
    const pairs = 5_000
    const z = normalDraws(pairs, 20, 1)
    let sum = 0
    let sq = 0
    for (const v of z) {
      sum += v
      sq += v * v
    }
    expect(Math.abs(sum / z.length)).toBeLessThan(0.01)
    expect(Math.abs(sq / z.length - 1)).toBeLessThan(0.02)
    // One year against the next, for the same pair.
    let cross = 0
    for (let t = 1; t < 20; t++) for (let k = 0; k < pairs; k++) cross += z[(t - 1) * pairs + k]! * z[t * pairs + k]!
    expect(Math.abs(cross / (19 * pairs))).toBeLessThan(0.02)
  })

  it('is the same matrix it hands out twice, drawn once', () => {
    expect(normalDraws(30, 8, 5)).toBe(normalDraws(30, 8, 5))
  })
})
