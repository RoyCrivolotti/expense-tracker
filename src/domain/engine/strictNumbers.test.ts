import { describe, expect, it } from 'vitest'
import {
  MAX_MONEY_CENTS,
  parseMoneyToCents,
  resolveMoneyFormat,
  tryParseDecimal,
  tryParseMoneyToCents,
  tryParsePercentToFraction,
} from './money'

const eur = resolveMoneyFormat('EUR', 'de-DE')
const usd = resolveMoneyFormat('USD', 'en-US')

describe('tryParseMoneyToCents: an amount, or null when what was typed is not one', () => {
  it.each([
    ['250000', 25_000_000, 25_000_000],
    ['1.234,56', 123_456, 123_456],
    ['1,234.56', 123_456, 123_456],
    ['1,234,567.89', 123_456_789, 123_456_789],
    ['1.234.567,89', 123_456_789, 123_456_789],
    ['12,5', 1250, 1250],
    ['€ 1.500', 150_000, 150],
    ['$1,500', 150, 150_000],
    ['-3,5', -350, -350],
  ])('reads %j as %i cents in euros and %i in dollars', (typed, euros, dollars) => {
    expect(tryParseMoneyToCents(typed, eur)).toBe(euros)
    expect(tryParseMoneyToCents(typed, usd)).toBe(dollars)
  })

  it.each(['250k', '1e9', '1.5M', 'about 4', 'abc', '', '   ', '4x', '1e1', '0x10', '12 euros'])(
    'is null for %j, which is not an amount and must not be read as the digits in it',
    (typed) => {
      expect(tryParseMoneyToCents(typed, eur)).toBeNull()
      expect(tryParseMoneyToCents(typed, usd)).toBeNull()
    },
  )

  it('keeps a number far beyond any balance to a ceiling, not to Infinity', () => {
    const huge = '9'.repeat(310)
    expect(tryParseMoneyToCents(huge, eur)).toBe(MAX_MONEY_CENTS)
    expect(tryParseMoneyToCents(`-${huge}`, eur)).toBe(-MAX_MONEY_CENTS)
    expect(tryParseMoneyToCents('99999999999999999999', usd)).toBe(MAX_MONEY_CENTS)
  })
})

describe('parseMoneyToCents with both marks in the text', () => {
  it('reads the last mark as the decimal one, whichever format it is read by', () => {
    // 1,234.56 read by a comma format was 1,23 euros: the point was dropped as a group mark.
    expect(parseMoneyToCents('1,234.56', eur)).toBe(123_456)
    expect(parseMoneyToCents('1.234,56', usd)).toBe(123_456)
    expect(parseMoneyToCents('1,234,567.89', eur)).toBe(123_456_789)
  })

  it('still reads a lone mark by the format, with three digits after it as a group', () => {
    expect(parseMoneyToCents('1.500', eur)).toBe(150_000)
    expect(parseMoneyToCents('1,500', usd)).toBe(150_000)
    expect(parseMoneyToCents('1.234.567', eur)).toBe(123_456_700)
  })
})

describe('tryParseDecimal: a plain number, or null', () => {
  it.each([
    ['4', 4],
    ['4,5', 4.5],
    ['4.5', 4.5],
    [' 22,5 ', 22.5],
    ['0,59', 0.59],
    ['-2', -2],
    ['.5', 0.5],
  ])('reads %j as %d', (typed, value) => {
    expect(tryParseDecimal(typed)).toBe(value)
  })

  it.each(['', ' ', 'about 4', '4k', '1e9', '0x10', 'Infinity', '1,2,3', '--2', '4%', '4 5'])('is null for %j', (typed) => {
    expect(tryParseDecimal(typed)).toBeNull()
  })
})

describe('tryParsePercentToFraction', () => {
  it.each([
    ['4', 0.04],
    ['4%', 0.04],
    ['3,5 %', 0.035],
    ['0.5', 0.005],
  ])('reads %j as %d', (typed, fraction) => {
    expect(tryParsePercentToFraction(typed)).toBeCloseTo(fraction, 10)
  })

  it.each(['about 4', '4k', '', '%', '1e1'])('is null for %j, so a withdrawal rate is not turned into its minimum', (typed) => {
    expect(tryParsePercentToFraction(typed)).toBeNull()
  })
})
