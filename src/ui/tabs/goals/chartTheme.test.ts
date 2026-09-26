import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT, type MoneyFormat } from '../../../engine'
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

describe('negative amounts', () => {
  // The Composition chart plots the mortgage below zero, so its lowest tick is negative. In full
  // ("-5.000.000,00 €") it was wider than the axis' margin and lost the start of its label.
  it('compact by size, with the minus in front', () => {
    expect(formatMoneyShort(-5_000_000_00, EU_MONEY_FORMAT)).toBe('-5.0M €')
    expect(formatMoneyShort(-340_000_00, EU_MONEY_FORMAT)).toBe('-340k €')
    expect(formatMoneyAxis(-1_020_000_00, EU_MONEY_FORMAT, 20_000_00)).toBe('-1.02M €')
    expect(formatMoneyAxis(-117_500_00, EU_MONEY_FORMAT, 500_00)).toBe('-117.5k €')
  })

  it('keeps small negatives, zero and negative infinity as they were', () => {
    expect(formatMoneyShort(-45_00, EU_MONEY_FORMAT)).toBe('-45,00 €')
    expect(formatMoneyAxis(-45_00, EU_MONEY_FORMAT, 10_00)).toBe('-45,00 €')
    expect(formatMoneyShort(0, EU_MONEY_FORMAT)).toBe('0,00 €')
    expect(formatMoneyShort(-Infinity, EU_MONEY_FORMAT)).toBe('-∞ €')
  })

  it('puts the minus before a prefix symbol, as formatCents does', () => {
    const usd: MoneyFormat = { ...EU_MONEY_FORMAT, symbol: '$', symbolPosition: 'prefix' }
    expect(formatMoneyShort(-5_000_000_00, usd)).toBe('-$5.0M')
    expect(formatMoneyShort(5_000_000_00, usd)).toBe('$5.0M')
  })

  it('leaves the signed form alone, which already took the absolute value', () => {
    expect(formatSignedMoneyShort(-5_000_000_00, EU_MONEY_FORMAT)).toBe('−5.0M €')
    expect(formatSignedMoneyShort(5_000_000_00, EU_MONEY_FORMAT)).toBe('+5.0M €')
  })
})
