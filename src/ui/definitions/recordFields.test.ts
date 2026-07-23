import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT, resolveMoneyFormat } from '../../engine/money'
import { fromInput, toInput } from './recordFields'

describe('recordFields money', () => {
  it.each([110, 1010, 145660])('round-trips %i cents in EU format', (cents) => {
    const input = toInput('money', cents, EU_MONEY_FORMAT)
    expect(fromInput('money', input, EU_MONEY_FORMAT)).toBe(cents)
  })

  it.each([110, 1010, 145660])('round-trips %i cents in US format', (cents) => {
    const usd = resolveMoneyFormat('USD', 'en-US')
    const input = toInput('money', cents, usd)
    expect(fromInput('money', input, usd)).toBe(cents)
  })

  it('formats with the locale decimal separator', () => {
    expect(toInput('money', 145660, EU_MONEY_FORMAT)).toBe('1.456,60')
    expect(toInput('money', 145660, resolveMoneyFormat('USD', 'en-US'))).toBe('1,456.60')
  })
})

describe('recordFields percent', () => {
  it('round-trips a fraction through the EU comma-decimal format', () => {
    const input = toInput('percent', 0.235, EU_MONEY_FORMAT)
    expect(input).toBe('23,5')
    expect(fromInput('percent', input, EU_MONEY_FORMAT)).toBeCloseTo(0.235, 5)
  })

  it('round-trips a fraction through the US dot-decimal format', () => {
    const usd = resolveMoneyFormat('USD', 'en-US')
    const input = toInput('percent', 0.235, usd)
    expect(input).toBe('23.5')
    expect(fromInput('percent', input, usd)).toBeCloseTo(0.235, 5)
  })

  it('parses a comma-decimal percent typed by hand', () => {
    expect(fromInput('percent', '3,5', EU_MONEY_FORMAT)).toBeCloseTo(0.035, 5)
  })
})
