import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from '../../../engine'
import { formatMoneyAxis, formatMoneyShort, formatSignedMoneyShort } from './chartTheme'

describe('formatMoneyAxis', () => {
  it('adds decimals until neighbouring ticks read differently', () => {
    // Ticks 20k apart around a million: one decimal would print 1.0M five times.
    expect(formatMoneyAxis(1_020_000_00, EU_MONEY_FORMAT, 20_000_00)).toBe('1.02M €')
    expect(formatMoneyAxis(1_000_000_00, EU_MONEY_FORMAT, 2_000_000_00)).toBe('1.0M €')
    expect(formatMoneyAxis(117_500_00, EU_MONEY_FORMAT, 500_00)).toBe('117.5k €')
    expect(formatMoneyAxis(340_000_00, EU_MONEY_FORMAT, 100_000_00)).toBe('340k €')
  })

  it('never goes past three decimals, and still handles infinity', () => {
    expect(formatMoneyAxis(1_000_100_00, EU_MONEY_FORMAT, 1_00)).toBe('1.000M €')
    expect(formatMoneyAxis(Infinity, EU_MONEY_FORMAT, 1)).toBe('∞ €')
  })
})

describe('formatMoneyShort', () => {
  it('compacts millions and thousands', () => {
    expect(formatMoneyShort(1_200_000_00, EU_MONEY_FORMAT)).toBe('1.2M €')
    expect(formatMoneyShort(340_000_00, EU_MONEY_FORMAT)).toBe('340k €')
  })

  it('falls back to the full format below a thousand', () => {
    expect(formatMoneyShort(45_00, EU_MONEY_FORMAT)).toBe('45,00 €')
  })

  it('defers to formatCents for an infinite amount', () => {
    // Infinity clears the millions threshold, so the compact branch used to claim
    // "InfinityM". fireNumber returns Infinity for a zero withdrawal rate on purpose.
    expect(formatMoneyShort(Infinity, EU_MONEY_FORMAT)).toBe('∞ €')
    expect(formatMoneyShort(NaN, EU_MONEY_FORMAT)).toBe('—')
  })

  it('keeps the sign in front of an infinite amount', () => {
    expect(formatSignedMoneyShort(Infinity, EU_MONEY_FORMAT)).toBe('+∞ €')
  })
})
