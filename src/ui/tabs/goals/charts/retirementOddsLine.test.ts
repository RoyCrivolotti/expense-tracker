import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from '../../../../engine/money'
import type { RetirementOdds } from '../../../../engine'
import { retirementOddsLine, runsOfHundred } from './retirementOddsLine'

const odds = (lasts: number, unluckiestTenth = 30, years = 30): RetirementOdds => ({ runs: 10_000, years, lasts, unluckiestTenth })
const line = (over: Partial<Parameters<typeof retirementOddsLine>[0]> = {}) =>
  retirementOddsLine({
    rate: 0.04,
    years: 30,
    realReturn: 0.05,
    volatility: 0.15,
    results: [
      { rate: 0.04, odds: odds(0.855, 25) },
      { rate: 0.035, odds: odds(0.913) },
      { rate: 0.03, odds: odds(0.954) },
    ],
    format: EU_MONEY_FORMAT,
    ...over,
  })

describe('runsOfHundred', () => {
  it('is a whole number out of 100, never 0 or 100 for a share that is not, so a risk is not rounded away', () => {
    expect(runsOfHundred(0)).toBe(0)
    expect(runsOfHundred(1)).toBe(100)
    expect(runsOfHundred(0.855)).toBe(86)
    expect(runsOfHundred(0.9996)).toBe(99)
    expect(runsOfHundred(0.0004)).toBe(1)
  })
})

describe('retirementOddsLine', () => {
  it('says how often the money lasts at the plan\'s rate, how long it lasts in the unluckiest tenth, and the other rates', () => {
    expect(line()).toBe(
      'Started at the target, with the spending taken out each year, the money lasts all 30 years in 86 of 100 runs at your 4,0% (in 10 of the 100 it lasts 25 years or less), 91 at 3,5% and 95 at 3,0%. The typical return is 5,0% a year with a bounce of 15,0%.',
    )
  })

  it('leaves the worst tenth out when it lasts the whole time too', () => {
    const text = line({ results: [{ rate: 0.04, odds: odds(0.97) }, { rate: 0.035, odds: odds(0.99) }, { rate: 0.03, odds: odds(1) }] })
    expect(text).not.toContain('10 of the 100')
    expect(text).toContain('in 97 of 100 runs at your 4,0%')
  })

  it('names the plan\'s own rate first and lists only the usual rates that differ from it', () => {
    const text = line({
      rate: 0.0325,
      years: 50,
      results: [
        { rate: 0.0325, odds: odds(0.833, 35, 50) },
        { rate: 0.04, odds: odds(0.711, 25, 50) },
        { rate: 0.035, odds: odds(0.79, 30, 50) },
        { rate: 0.03, odds: odds(0.86, 40, 50) },
      ],
    })
    expect(text).toContain('all 50 years in 83 of 100 runs at your 3,25%')
    expect(text).toContain('(in 10 of the 100 it lasts 35 years or less), 71 at 4,0%, 79 at 3,5% and 86 at 3,0%.')
  })

  it('says what the cut-off means: one run in ten lasts that long or less, some of them less, not that the worst tenth lasts that long', () => {
    expect(line()).not.toContain('unluckiest')
    expect(line()).toContain('in 10 of the 100 it lasts 25 years or less')
  })

  it('says it in the singular for one year, and that the money runs out in the first year when it does', () => {
    const one = (years: number) => line({ years: 30, results: [{ rate: 0.04, odds: odds(0.8, years, 30) }, { rate: 0.035, odds: odds(0.9, 30, 30) }, { rate: 0.03, odds: odds(1, 30, 30) }] })!
    expect(one(1)).toContain('(in 10 of the 100 it lasts 1 year or less)')
    expect(one(0)).toContain('(in 10 of the 100 the money runs out in the first year)')
  })

  it('says "year" for one year', () => {
    expect(line({ years: 1, results: [{ rate: 0.04, odds: odds(0.99, 1, 1) }, { rate: 0.035, odds: odds(1, 1, 1) }, { rate: 0.03, odds: odds(1, 1, 1) }] })).toContain('all 1 year in')
  })

  it('has nothing to say without any result', () => {
    expect(line({ results: [] })).toBeNull()
  })
})
