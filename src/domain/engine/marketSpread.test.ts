import { describe, expect, it } from 'vitest'
import { samplePlan, SAMPLE_INFLATION } from '../../testing/samplePlan'
import { wholeYearsToAmount } from './milestoneOutlook'
import { crossingRange, growthFor, percentile, replayMarket, SPREAD_MAX_YEARS, SPREAD_SEED } from './marketSpread'
import { DRAW_YEARS, normalDraws } from './rng'
import { fireNumber, projectNetWorth, yearsToFi, type ProjectionParams } from './projection'
import { scenarioToParams } from './scenarioProjection'

const I = SAMPLE_INFLATION
const sample = (over = {}): ProjectionParams => scenarioToParams(samplePlan({ ...over }), I)
/** No saving, no house, no events: only the starting amount grows, so the spread has a closed form. */
const bare = (over: Partial<ProjectionParams> = {}): ProjectionParams => ({
  ...sample({ housePurchaseYear: null, lifeEvents: [], monthlyContributionCents: 0, contributionSchedule: [] }),
  ...over,
})

describe('the draws a replay reads', () => {
  it('are the hundred years a retirement can last, so the spread and a retirement share one matrix instead of making it twice', () => {
    expect(DRAW_YEARS).toBe(100)
    const before = normalDraws(50, DRAW_YEARS, SPREAD_SEED)
    replayMarket({ params: bare(), volatility: 0.15, runs: 100 })
    expect(normalDraws(50, DRAW_YEARS, SPREAD_SEED)).toBe(before)
  })
})

describe('growthFor', () => {
  it('is the plan\'s growth at no spread, to the bit', () => {
    expect(growthFor(1_000_000, 0.05, 0, 1.7)).toBe(1 + 0.05)
    expect(growthFor(1_000_000, 0.05, 0, -3)).toBe(1 + 0.05)
  })

  it('is the typical growth times e to the spread times the draw, for a balance in credit', () => {
    expect(growthFor(1_000_000, 0.05, 0.15, 1)).toBeCloseTo(1.05 * Math.exp(0.15), 12)
    expect(growthFor(1_000_000, 0.05, 0.15, -2)).toBeCloseTo(1.05 * Math.exp(-0.3), 12)
  })

  it('grows a debt at the plain return, not with the market: nobody is short the market on a debt', () => {
    expect(growthFor(-1, 0.05, 0.15, 2)).toBe(1.05)
    expect(growthFor(-1, 0.05, 0.15, -2)).toBe(1.05)
    expect(growthFor(0, 0.05, 0.15, 2)).toBeCloseTo(1.05 * Math.exp(0.3), 12)
  })
})

describe('percentile', () => {
  it('interpolates between the sorted values', () => {
    const v = Float64Array.from([10, 20, 30, 40, 50])
    expect(percentile(v, 0)).toBe(10)
    expect(percentile(v, 50)).toBe(30)
    expect(percentile(v, 100)).toBe(50)
    expect(percentile(v, 25)).toBe(20)
    expect(percentile(v, 10)).toBeCloseTo(14, 12)
  })
})

describe('crossingRange', () => {
  // Runs counted by the year they first cross, for years 0 to 8 unless said.
  const counts = (byYear: Record<number, number>, years = 8) => Array.from({ length: years + 1 }, (_, y) => byYear[y] ?? 0)

  it('names the year at each rank, counted nearest-rank, with the share that gets there', () => {
    const r = crossingRange(counts({ 5: 1, 6: 1, 7: 1 }), 2)
    // Five runs: three cross, in years 5, 6 and 7, and two never do.
    expect(r.share).toBeCloseTo(0.6, 12)
    expect(r.p10).toBe(5)
    expect(r.p25).toBe(6)
    expect(r.p50).toBe(7)
    expect(r.p75).toBe(Infinity)
    expect(r.p90).toBe(Infinity)
  })

  it('is never NaN where a rank falls among the runs that never cross, and never a fraction of a year', () => {
    const r = crossingRange(counts({ [2036 - 2030]: 1, [2037 - 2030]: 1, [2041 - 2030]: 1 }, 12), 0)
    for (const v of [r.p10, r.p25, r.p50, r.p75, r.p90]) expect(Number.isNaN(v)).toBe(false)
    expect([r.p10, r.p25, r.p50]).toEqual([6, 6, 7])
    const never = crossingRange(counts({}), 10)
    expect([never.p10, never.p50, never.p90, never.share]).toEqual([Infinity, Infinity, Infinity, 0])
  })

  it('is one year for everyone when they all cross in it, and none of the runs never', () => {
    const r = crossingRange(counts({ 3: 100 }), 0)
    expect([r.p10, r.p25, r.p50, r.p75, r.p90, r.share]).toEqual([3, 3, 3, 3, 3, 1])
  })
})

describe('replayMarket at no spread', () => {
  it('is the plan, every year and every percentile, to the cent, before and after the events', () => {
    for (const over of [{}, { housePurchaseYear: 0 }, { housePurchaseYear: null, lifeEvents: [{ year: 4, amountCents: -500_000, label: 'x' }] }]) {
      const params = sample(over)
      const plan = projectNetWorth(params)
      const out = replayMarket({ params, volatility: 0, runs: 200 })
      expect(out.years).toBe(Math.min(params.horizonYears, SPREAD_MAX_YEARS))
      for (const band of Object.values(out.after)) expect(band).toEqual(plan.map((p) => p.investedCents))
      for (const band of Object.values(out.before)) expect(band).toEqual(plan.map((p) => p.preEventInvestedCents))
    }
  })

  it('has the first crossing of every amount the plan has, in the year the plan says, and the FI year too', () => {
    const params = sample()
    const amounts = Array.from({ length: 400 }, (_, k) => 2_000_000 + k * 400_000)
    const out = replayMarket({ params, volatility: 0, runs: 100, milestonesCents: amounts, fiTargetCents: fireNumber(3_000_000, 0.04) })
    amounts.forEach((amount, k) => {
      const plan = wholeYearsToAmount(params, amount, I)
      const range = out.milestones[k]!
      const expected = plan === null ? Infinity : plan
      expect([range.p10, range.p50, range.p90]).toEqual([expected, expected, expected])
      expect(range.share).toBe(plan === null ? 0 : 1)
    })
    const fi = yearsToFi(params, 3_000_000, 0.04)
    expect([out.fi!.p10, out.fi!.p50, out.fi!.p90]).toEqual(Array(3).fill(fi ?? Infinity))
  })

  it('has nobody below nothing in the plan the sample plan makes', () => {
    expect(replayMarket({ params: sample(), volatility: 0, runs: 100 }).belowZero.every((s) => s === 0)).toBe(true)
  })
})

describe('replayMarket with a spread', () => {
  const params = bare({ startInvestedCents: 10_000_000, horizonYears: 30 })
  const out = replayMarket({ params, volatility: 0.15, runs: 10_000 })
  const z = [-1.2815515655446004, -0.6744897501960817, 0, 0.6744897501960817, 1.2815515655446004]

  it('is the typical growth with a lognormal spread when nothing is added or taken: P(1+r)^n times e to the spread times the root of the years times the quantile', () => {
    const keys = ['p10', 'p25', 'p50', 'p75', 'p90'] as const
    for (const n of [1, 5, 10, 20, 30]) {
      keys.forEach((k, q) => {
        const expected = 10_000_000 * Math.pow(1.05, n) * Math.exp(0.15 * Math.sqrt(n) * z[q]!)
        expect(Math.abs(out.after[k][n]! / expected - 1)).toBeLessThan(0.05)
      })
    }
  })

  it('has every run mirrored by another, so with nothing added or taken the lower and upper bands are the same distance from the middle in logs', () => {
    for (const n of [5, 10, 20, 30]) {
      const lnp = (v: number) => Math.log(v)
      expect(Math.abs(lnp(out.after.p10[n]!) + lnp(out.after.p90[n]!) - 2 * lnp(out.after.p50[n]!))).toBeLessThan(1e-4)
    }
  })

  it('starts as one amount and spreads from there, and the bands are ordered in every year', () => {
    const start = out.after
    expect(new Set([start.p10[0], start.p50[0], start.p90[0]]).size).toBe(1)
    for (let t = 0; t <= out.years; t++) {
      expect(out.after.p10[t]!).toBeLessThanOrEqual(out.after.p25[t]!)
      expect(out.after.p25[t]!).toBeLessThanOrEqual(out.after.p50[t]!)
      expect(out.after.p50[t]!).toBeLessThanOrEqual(out.after.p75[t]!)
      expect(out.after.p75[t]!).toBeLessThanOrEqual(out.after.p90[t]!)
    }
  })

  it('is the same picture for the same inputs, and a wider one for a bigger spread, year after year', () => {
    expect(replayMarket({ params, volatility: 0.15, runs: 10_000 }).after.p50).toEqual(out.after.p50)
    const wide = replayMarket({ params, volatility: 0.3, runs: 10_000 })
    const narrow = replayMarket({ params, volatility: 0.07, runs: 10_000 })
    for (let t = 1; t <= 30; t++) {
      const width = (r: typeof out) => r.after.p90[t]! - r.after.p10[t]!
      expect(width(narrow)).toBeLessThan(width(out))
      expect(width(out)).toBeLessThan(width(wide))
    }
  })

  it('keeps the first years of a picture when the plan is made longer, because the draws belong to the year and not to the length', () => {
    const shorter = replayMarket({ params: { ...params, horizonYears: 12 }, volatility: 0.15, runs: 4_000 })
    const longer = replayMarket({ params: { ...params, horizonYears: 31 }, volatility: 0.15, runs: 4_000 })
    for (const k of ['p10', 'p25', 'p50', 'p75', 'p90'] as const) expect(longer.after[k].slice(0, 13)).toEqual(shorter.after[k])
  })

  it('moves smoothly when the typical return does: the same draws, a different return', () => {
    const at = (r: number) => replayMarket({ params: { ...params, expectedRealReturn: r }, volatility: 0.15, runs: 4_000 }).after.p10[20]!
    const steps = [0.045, 0.046, 0.047, 0.048].map(at)
    for (let i = 1; i < steps.length; i++) expect(Math.abs(steps[i]! / steps[i - 1]! - 1)).toBeLessThan(0.03)
  })

  it('crosses an amount in years that get later for a bigger amount, and are whole years', () => {
    const amounts = [15_000_000, 25_000_000, 40_000_000, 80_000_000]
    const r = replayMarket({ params, volatility: 0.15, runs: 5_000, milestonesCents: amounts })
    for (let k = 1; k < amounts.length; k++) {
      expect(r.milestones[k]!.p50).toBeGreaterThanOrEqual(r.milestones[k - 1]!.p50)
      expect(r.milestones[k]!.share).toBeLessThanOrEqual(r.milestones[k - 1]!.share)
    }
    for (const range of r.milestones) for (const v of [range.p10, range.p50, range.p90]) expect(Number.isInteger(v) || v === Infinity).toBe(true)
  })

  it('rounds an odd number of runs up to a pair, so every run has the mirror of its draws', () => {
    expect(replayMarket({ params, volatility: 0.15, runs: 1_001 }).runs).toBe(1_002)
    expect(replayMarket({ params, volatility: 0.15, runs: 1 }).runs).toBe(2)
  })
})

describe('replayMarket when the house takes more than the portfolio has', () => {
  // 10.000 € in the portfolio and a house that takes the down payment of 60.000 € in year 3.
  const short = sample({ startInvestedCents: 1_000_000, monthlyContributionCents: 0, housePurchaseYear: 3, lifeEvents: [] })
  const out = replayMarket({ params: short, volatility: 0.15, runs: 2_000 })

  it('says how many runs are in debt each year, from the year the house is paid for', () => {
    expect(out.belowZero.slice(0, 3).every((s) => s === 0)).toBe(true)
    expect(out.belowZero[3]).toBeGreaterThan(0.9)
  })

  it('lets the debt grow at the plain return rather than with the market, so each run\'s debt keeps its size against the others', () => {
    expect(out.belowZero[3]).toBe(1)
    // Nobody has anything left to risk, so from year 3 every run grows at 5% and the ranks and the ratios stay as they were.
    for (const k of ['p10', 'p50', 'p90'] as const) {
      expect(out.after[k][3]!).toBeLessThan(0)
      expect(Math.abs(out.after[k][8]! / out.after[k][3]! - Math.pow(1.05, 5))).toBeLessThan(1e-3)
    }
    expect(out.belowZero[8]).toBe(1)
  })
})
