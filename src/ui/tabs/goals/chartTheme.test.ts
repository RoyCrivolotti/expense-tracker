import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from '../../../engine'
import { formatMoneyShort, formatSignedMoneyShort } from './chartTheme'

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
