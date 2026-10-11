import { describe, expect, it } from 'vitest'
import { projectDrawdown } from './projection'
import { DRAW_SEED, DRAW_YEARS, normalDraws } from './rng'
import { replayRetirement, type RetirementOddsInput } from './retirementOdds'

const base: RetirementOddsInput = {
  startCents: 75_000_000,
  annualWithdrawalCents: 3_000_000,
  realReturn: 0.05,
  volatility: 0.15,
  years: 30,
  runs: 4_000,
}
const odds = (over: Partial<RetirementOddsInput> = {}) => replayRetirement({ ...base, ...over })

/** The plan's drawdown year by year with no clamp at nothing, so a year the money is short can be told from a year it is exactly spent. */
function drawdownSeries(start: number, withdrawal: number, realReturn: number, years: number): number[] {
  const series = [start]
  for (let y = 1; y <= years; y++) series.push(Math.round(series[y - 1]! * (1 + realReturn) - withdrawal))
  return series
}

/** The first year the money is short, or null. */
function firstShortYear(start: number, withdrawal: number, realReturn: number, years: number): number | null {
  const short = drawdownSeries(start, withdrawal, realReturn, years).findIndex((balance) => balance < 0)
  return short < 0 ? null : short
}

/** The replay written the plain way, a run at a time, from the same draws. */
function bruteForce(input: RetirementOddsInput) {
  const pairs = Math.max(1, Math.ceil(input.runs / 2))
  const runs = pairs * 2
  const years = input.years
  const draws = normalDraws(pairs, DRAW_YEARS, DRAW_SEED)
  const lasted: number[] = []
  for (let run = 0; run < runs; run++) {
    let bal = input.startCents
    let got = years
    for (let y = 1; y <= years; y++) {
      const z = draws[(y - 1) * pairs + (run >> 1)]! * (run % 2 === 1 ? -1 : 1)
      bal = Math.round(bal * ((1 + input.realReturn) * Math.exp(input.volatility * z)) - input.annualWithdrawalCents)
      if (bal < 0) {
        got = y - 1
        break
      }
    }
    lasted.push(got)
  }
  lasted.sort((a, b) => a - b)
  return { lasts: lasted.filter((g) => g === years).length / runs, unluckiestTenth: lasted[Math.ceil(0.1 * runs) - 1]! }
}

describe('replayRetirement with no bounce', () => {
  it('is the drawdown of the plan, to the cent: it lasts exactly when the deterministic balance never goes short', () => {
    const cases = [
      [75_000_000, 3_000_000, 0.05, 30],
      [50_000_000, 3_000_000, 0.05, 30],
      [60_000_000, 3_000_000, 0.02, 40],
      [30_000_000, 3_000_000, 0, 10],
      [30_000_000, 3_000_000, 0, 11],
      [123_456_789, 4_567_891, 0.031, 57],
      [10_000_000, 3_000_000, 0.08, 100],
    ] as const
    for (const [start, withdrawal, realReturn, years] of cases) {
      // The recurrence here is the plan's own drawdown, which clamps what it shows at nothing.
      expect(projectDrawdown(start, withdrawal, realReturn, years)).toEqual(
        drawdownSeries(start, withdrawal, realReturn, years).map((balance) => Math.max(0, balance)),
      )
      const short = firstShortYear(start, withdrawal, realReturn, years)
      const out = replayRetirement({ startCents: start, annualWithdrawalCents: withdrawal, realReturn, volatility: 0, years, runs: 200 })
      expect(out.lasts).toBe(short === null ? 1 : 0)
      expect(out.unluckiestTenth).toBe(short === null ? years : short - 1)
    }
  })

  it('rounds each year to the cent as the plan\'s drawdown does, so 40 cents short in a year is not short', () => {
    // 1.000 cents at -0,04% grows to 999,6, less 1.000 is -0,4, which is nothing once rounded.
    const out = replayRetirement({ startCents: 1_000, annualWithdrawalCents: 1_000, realReturn: -0.0004, volatility: 0, years: 1, runs: 2 })
    expect(out).toMatchObject({ lasts: 1, unluckiestTenth: 1 })
    expect(projectDrawdown(1_000, 1_000, -0.0004, 1)).toEqual([1_000, 0])
  })

  it('lasts as many years as the target is of the spending, at no return: a 4% target is 25 years of it', () => {
    const at = (years: number) => odds({ startCents: 75_000_000, annualWithdrawalCents: 3_000_000, realReturn: 0, volatility: 0, years })
    expect(at(25)).toMatchObject({ lasts: 1, unluckiestTenth: 25 })
    expect(at(26)).toMatchObject({ lasts: 0, unluckiestTenth: 25 })
    expect(at(60)).toMatchObject({ lasts: 0, unluckiestTenth: 25 })
  })
})

describe('replayRetirement in a bouncing market', () => {
  it('matches the plain run-at-a-time version exactly, shares and years', () => {
    for (const over of [{}, { years: 50, volatility: 0.2 }, { annualWithdrawalCents: 2_625_000, years: 45 }, { runs: 1_001 }, { runs: 2 }, { runs: 4, years: 60 }, { realReturn: 0.02, years: 100 }]) {
      const input = { ...base, ...over }
      expect(replayRetirement(input)).toMatchObject(bruteForce(input))
    }
  })

  it('agrees with an independent simulation written from scratch (100.000 runs in Python, its own random numbers)', () => {
    const run = (swr: number, years: number) => {
      const spend = 3_000_000
      return odds({ startCents: Math.round(spend / swr), annualWithdrawalCents: spend, years, runs: 10_000 })
    }
    // Python: 4% over 30 years 85,5, 3,5% 91,3, 3% 95,4, 4% over 50 years 71,1, 3,25% over 50 years 83,3.
    expect(Math.abs(run(0.04, 30).lasts * 100 - 85.5)).toBeLessThan(1.5)
    expect(Math.abs(run(0.035, 30).lasts * 100 - 91.3)).toBeLessThan(1.5)
    expect(Math.abs(run(0.03, 30).lasts * 100 - 95.4)).toBeLessThan(1.5)
    expect(Math.abs(run(0.04, 50).lasts * 100 - 71.1)).toBeLessThan(1.5)
    expect(Math.abs(run(0.0325, 50).lasts * 100 - 83.3)).toBeLessThan(1.5)
    // The unluckiest tenth of the 4% runs lasts 25 years in Python, and 30 (all of it) at 3,5%.
    expect(Math.abs(run(0.04, 30).unluckiestTenth - 25)).toBeLessThanOrEqual(1)
    expect(run(0.035, 30).unluckiestTenth).toBe(30)
  })

  it('is less likely to last the longer it has to, the bouncier the market is, and the higher the withdrawal', () => {
    const lasts = (over: Partial<RetirementOddsInput>) => odds(over).lasts
    expect(lasts({ years: 20 })).toBeGreaterThanOrEqual(lasts({ years: 30 }))
    expect(lasts({ years: 30 })).toBeGreaterThan(lasts({ years: 50 }))
    expect(lasts({ volatility: 0.05 })).toBeGreaterThan(lasts({ volatility: 0.25 }))
    expect(lasts({ annualWithdrawalCents: 2_400_000 })).toBeGreaterThan(lasts({ annualWithdrawalCents: 3_600_000 }))
  })

  it('is the same picture for the same inputs, and rounds an odd number of runs up to a pair', () => {
    expect(odds()).toEqual(odds())
    expect(odds({ runs: 1_001 }).runs).toBe(1_002)
  })

  it('always lasts with nothing to withdraw, and never with nothing to start from', () => {
    expect(odds({ annualWithdrawalCents: 0 })).toMatchObject({ lasts: 1, unluckiestTenth: 30 })
    expect(odds({ startCents: 0 })).toMatchObject({ lasts: 0, unluckiestTenth: 0 })
  })

  it('holds the years to what the draws cover: at least one, at most the hundred the setting allows', () => {
    expect(odds({ years: 0 }).years).toBe(1)
    expect(odds({ years: 150 }).years).toBe(DRAW_YEARS)
    expect(DRAW_YEARS).toBe(100)
  })

  it('keeps the first years of a longer retirement the same as a shorter one: a run short in year 10 is short in both', () => {
    // Funded well under the target, so a tenth of the runs fail within the first years: the year that tenth falls at
    // is the same whether the money has to last 20 years or 40, since the runs and their draws are the same.
    for (const startCents of [25_000_000, 30_000_000, 35_000_000]) {
      const short = odds({ years: 20, runs: 2_000, startCents })
      const long = odds({ years: 40, runs: 2_000, startCents })
      expect(short.unluckiestTenth).toBeLessThan(20)
      expect(long.unluckiestTenth).toBe(short.unluckiestTenth)
      expect(long.lasts).toBeLessThanOrEqual(short.lasts)
    }
  })
})
