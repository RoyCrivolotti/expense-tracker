import { describe, expect, it } from 'vitest'
import {
  MAX_MONEY_CENTS,
  parseMoneyToCents,
  resolveMoneyFormat,
  tryParseDecimal,
  tryParseMoneyToCents,
  tryParsePercentToFraction,
  formatPercentInput,
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

describe('tryParseMoneyToCents: the shape of the number, not only its characters', () => {
  it.each([
    '1..5',
    '1,,5',
    '1.5.5',
    '1,2,3',
    '12.34.56',
    '1.234,567.89',
    '5-5',
    '5-',
    '--5',
    '1 2',
    '1 23 456',
    '12,34 56',
    "1'2",
    '1.5,5',
    '€€5',
    '€5€',
    '5 € €',
    '-€-5',
    '.',
    ',',
    '-',
    '$',
    '€ -',
  ])('is null for %j, which has the right characters in the wrong places', (typed) => {
    expect(tryParseMoneyToCents(typed, eur)).toBeNull()
    expect(tryParseMoneyToCents(typed, usd)).toBeNull()
  })

  it('does not take a letter of the currency symbol for a letter inside the number', () => {
    const chf = resolveMoneyFormat('CHF', 'de-CH')
    expect(tryParseMoneyToCents('CHF 1500', chf)).toBe(150_000)
    expect(tryParseMoneyToCents('1500 CHF', chf)).toBe(150_000)
    expect(tryParseMoneyToCents('15CHF00', chf)).toBeNull()
    expect(tryParseMoneyToCents('C1500', chf)).toBeNull()
    expect(tryParseMoneyToCents('1H5F00', chf)).toBeNull()
  })

  it.each([
    ['€5', 500],
    ['5€', 500],
    ['5 €', 500],
    ['€ 5', 500],
    ['-€5', -500],
    ['€-5', -500],
    ['-5 €', -500],
    ['\u22125', -500],
    ["1'234'567.89", 123_456_789],
    ['1 234 567,89', 123_456_789],
    ['1\u00a0234', 123_400],
    ['  250  ', 25_000],
    ['5.', 500],
    ['.5', 50],
    ['0,5', 50],
  ])('still reads %j as %i cents', (typed, cents) => {
    expect(tryParseMoneyToCents(typed, eur)).toBe(cents)
  })
})

describe('tryParseMoneyToCents against a plain statement of the grammar', () => {
  // A number is 1 to 3 digits then groups of 3 with one kind of mark, or one run of digits; then at most one decimal mark.
  const wellFormed = /^(?:\d+|\d{1,3}(?:([.,' ])\d{3})+)(?:[.,]\d+)?$|^[.,]\d+$/
  const alphabet = ['0', '1', '5', '9', '.', ',', ' ', "'", '-', '€']

  it('reads a random string only when it is well formed, and as the cents it states', () => {
    let seed = 12345
    const next = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648)
    let accepted = 0
    for (let n = 0; n < 20_000; n += 1) {
      const length = 1 + (next() % 7)
      let typed = ''
      for (let i = 0; i < length; i += 1) typed += alphabet[next() % alphabet.length]
      const got = tryParseMoneyToCents(typed, eur)
      const body = typed.trim().replace(/^-\s*/, '').replace(/^€\s*/, '').replace(/\s*€$/, '').trim()
      if (got !== null) {
        accepted += 1
        expect(wellFormed.test(body.replace(/^(\d+)[.,]$/, '$1')), typed).toBe(true)
      } else if (/^\s*-?\d+\s*$/.test(typed)) {
        throw new Error(`${typed} is a plain integer and must be read`)
      }
    }
    expect(accepted).toBeGreaterThan(500)
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

describe('formatPercentInput shows the second decimal when the value has one', () => {
  it.each([
    [0.05, '5,0', '5.0'],
    [0.0325, '3,25', '3.25'],
    [0.035, '3,5', '3.5'],
    [0.0275, '2,75', '2.75'],
    [0.0001, '0,01', '0.01'],
    [0, '0,0', '0.0'],
  ])('writes %d as %s in a comma format and %s in a point format', (fraction, comma, point) => {
    expect(formatPercentInput(fraction, eur)).toBe(comma)
    expect(formatPercentInput(fraction, usd)).toBe(point)
  })

  it('reads back to the same fraction', () => {
    for (const fraction of [0.0325, 0.0275, 0.05, 0.0001, 0.12345]) {
      const shown = formatPercentInput(fraction, eur)
      expect(Math.abs((tryParsePercentToFraction(shown) ?? NaN) - fraction)).toBeLessThan(0.00006)
    }
  })

  it('still takes an explicit number of decimals', () => {
    expect(formatPercentInput(0.0325, eur, 1)).toBe('3,3')
  })
})
