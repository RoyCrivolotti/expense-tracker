import { describe, expect, it } from 'vitest'
import { fireNumber, projectDrawdown } from './projection'
import { DEFAULT_RETIREMENT_YEARS } from './projectionConstants'
import {
  FI_TARGET_RATES,
  RETIREMENT_RATE_BANDS,
  fiPatchForYears,
  fiTargetsCents,
  recommendedWithdrawalRate,
} from './retirementYears'

describe('recommendedWithdrawalRate', () => {
  it.each([
    [1, 0.04],
    [30, 0.04],
    [35, 0.04],
    [36, 0.035],
    [49, 0.035],
    [50, 0.0325],
    [60, 0.0325],
    [100, 0.0325],
  ])('is %s years: %s', (years, rate) => {
    expect(recommendedWithdrawalRate(years)).toBe(rate)
  })

  it('has bands that run from shorter to longer and a lower rate for each, and the last has no end', () => {
    expect(RETIREMENT_RATE_BANDS.map((b) => b.upTo)).toEqual([35, 49, Number.POSITIVE_INFINITY])
    const rates = RETIREMENT_RATE_BANDS.map((b) => b.rate)
    expect([...rates].sort((a, b) => b - a)).toEqual(rates)
  })

  it('starts at thirty years, which is the 4% of the usual rule', () => {
    expect(DEFAULT_RETIREMENT_YEARS).toBe(30)
    expect(recommendedWithdrawalRate(DEFAULT_RETIREMENT_YEARS)).toBe(0.04)
  })
})

describe('fiPatchForYears', () => {
  it('moves the rate to the guide for the new years when it was the guide for the old ones', () => {
    expect(fiPatchForYears({ retirementYears: 30, safeWithdrawalRate: 0.04 }, 40)).toEqual({ retirementYears: 40, safeWithdrawalRate: 0.035 })
    expect(fiPatchForYears({ retirementYears: 40, safeWithdrawalRate: 0.035 }, 55)).toEqual({ retirementYears: 55, safeWithdrawalRate: 0.0325 })
    expect(fiPatchForYears({ retirementYears: 55, safeWithdrawalRate: 0.0325 }, 25)).toEqual({ retirementYears: 25, safeWithdrawalRate: 0.04 })
  })

  it('leaves a rate that someone set themselves alone', () => {
    expect(fiPatchForYears({ retirementYears: 30, safeWithdrawalRate: 0.045 }, 55)).toEqual({ retirementYears: 55 })
    // 4% is not the guide for forty years, so for forty it is a choice, and it stays.
    expect(fiPatchForYears({ retirementYears: 40, safeWithdrawalRate: 0.04 }, 30)).toEqual({ retirementYears: 30 })
  })

  it('leaves the rate where it is when the guide is the same for the new years', () => {
    expect(fiPatchForYears({ retirementYears: 30, safeWithdrawalRate: 0.04 }, 35)).toEqual({ retirementYears: 35, safeWithdrawalRate: 0.04 })
  })

  it('reads a rate that was typed in as a percentage as the guide', () => {
    expect(fiPatchForYears({ retirementYears: 40, safeWithdrawalRate: 3.5 / 100 }, 20)).toEqual({ retirementYears: 20, safeWithdrawalRate: 0.04 })
    expect(fiPatchForYears({ retirementYears: 60, safeWithdrawalRate: 3.25 / 100 }, 20)).toEqual({ retirementYears: 20, safeWithdrawalRate: 0.04 })
  })
})

describe('fiTargetsCents', () => {
  it('is what the same spending needs at 4%, 3,5% and 3%', () => {
    // 30.000 € a year: 750.000 €, 857.143 € and 1.000.000 €.
    expect(fiTargetsCents(3_000_000)).toEqual([
      { rate: 0.04, targetCents: 75_000_000 },
      { rate: 0.035, targetCents: 85_714_286 },
      { rate: 0.03, targetCents: 100_000_000 },
    ])
  })

  it('is the same figure the plan uses for a rate, to the cent', () => {
    for (const spend of [1_234_567, 4_000_000, 9_999_999]) {
      for (const { rate, targetCents } of fiTargetsCents(spend)) expect(targetCents).toBe(fireNumber(spend, rate))
    }
  })

  it('is nothing to reach with no spending, and the three rates are fixed', () => {
    expect(fiTargetsCents(0).map((t) => t.targetCents)).toEqual([0, 0, 0])
    expect(FI_TARGET_RATES).toEqual([0.04, 0.035, 0.03])
  })
})

describe('the drawdown over the years the money must last', () => {
  function rng(seed: number) {
    let x = seed
    return () => {
      x = (x * 1664525 + 1013904223) % 4294967296
      return x / 4294967296
    }
  }

  it('is the balance an annuity leaves, B(1+r)^N less w((1+r)^N - 1)/r, until it is gone, for any number of years', () => {
    const rand = rng(5)
    for (let n = 0; n < 40; n++) {
      const start = Math.round(20_000_000 + rand() * 200_000_000)
      const withdrawal = Math.round(500_000 + rand() * 6_000_000)
      const r = 0.005 + rand() * 0.08
      const years = 1 + Math.floor(rand() * 60)
      const series = projectDrawdown(start, withdrawal, r, years)
      expect(series).toHaveLength(years + 1)
      const growth = Math.pow(1 + r, years)
      const closed = start * growth - (withdrawal * (growth - 1)) / r
      // Rounded to a cent each year, and held at nothing once there is nothing left.
      if (closed > 0 && series[years]! > 0) expect(Math.abs(series[years]! - closed)).toBeLessThanOrEqual(years + 1)
      else expect(closed <= years + 1 || series[years] === 0).toBe(true)
    }
  })

  it('runs out in the year the annuity does, and stays at nothing after it', () => {
    // 5 spends and nothing earned: gone after exactly 5 years.
    expect(projectDrawdown(5_000_000, 1_000_000, 0, 8)).toEqual([5_000_000, 4_000_000, 3_000_000, 2_000_000, 1_000_000, 0, 0, 0, 0])
  })
})
