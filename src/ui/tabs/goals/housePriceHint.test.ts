import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from '../../../engine'
import { samplePlan, SAMPLE_INFLATION } from '../../../testing/samplePlan'
import { housePriceDetail, housePriceHint } from './housePriceHint'

const hint = (over = {}, inflation = SAMPLE_INFLATION) =>
  housePriceHint(samplePlan(over), inflation, EU_MONEY_FORMAT)
const detail = (over = {}, inflation = SAMPLE_INFLATION) =>
  housePriceDetail(samplePlan(over), inflation, EU_MONEY_FORMAT)

describe('housePriceHint', () => {
  it('says what the house costs when it is bought, in the money of the plan start, and nothing more in the line under the price', () => {
    // 300.000 euros today, houses +3% a year, inflation 2%, bought in year 8: 324.353 euros of 2026.
    expect(hint()).toBe("Enter the price at the plan's start. Bought in year 8 it costs about 324.353 € in 2026 euros.")
  })

  it('keeps for the detail what the plan cannot be checked without: the same cost as paid, and the rates it came from', () => {
    // 300.000 x 1.03^8 = 380.031 euros on the day, as houses rise 3% a year and inflation is 2%.
    expect(detail()).toBe('When you pay it that is about 380.031 € on your account, as houses rise 3,0% a year and inflation is 2,0%.')
  })

  it('says the same price when houses only keep up with inflation', () => {
    expect(hint({ houseAppreciationRate: 0.02 })).toContain('about 300.000 € in 2026 euros')
    expect(detail({ houseAppreciationRate: 0.02 })).toContain('about 351.498 € on your account')
  })

  it('names today when the plan has no start date', () => {
    expect(hint({ planStartDate: null })).toContain("in today's euros")
    expect(hint({ planStartDate: null })).toContain("Enter today's price.")
  })

  it.each([
    ['no purchase', { housePurchaseYear: null }],
    ['a house already owned, whose price is what it is worth now', { housePurchaseYear: 0 }],
    ['no price entered', { housePriceCents: 0 }],
  ])('has nothing to say for %s', (_name, over) => {
    expect(hint(over)).toBeNull()
    expect(detail(over)).toBeNull()
  })
})
