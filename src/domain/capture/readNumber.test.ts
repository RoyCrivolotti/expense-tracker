import { describe, expect, it } from 'vitest'
import { readNumber } from './readNumber'

describe('readNumber', () => {
  it.each([
    ['12,34', 1234, 'comma'],
    ['4.54', 454, 'dot'],
    ['50.0', 5000, 'dot'],
    ['4000.0', 400000, 'dot'],
    ['2,99', 299, 'comma'],
    ['0,5', 50, 'comma'],
    ['1.234,56', 123456, 'comma'],
    ['1,234.56', 123456, 'dot'],
    ['999.999,8', 99999980, 'comma'],
    ['1234', 123400, 'none'],
    ['50', 5000, 'none'],
  ] as const)('reads %s as %i cents with a %s mark', (core, expected, mark) => {
    expect(readNumber(core)).toEqual([{ cents: expected, mark }])
  })

  it('reads a single separator and three digits as thousands, flagged ambiguous', () => {
    expect(readNumber('1.234')).toEqual([{ cents: 123400, mark: 'comma', ambiguous: true }])
    expect(readNumber('1,234')).toEqual([{ cents: 123400, mark: 'dot', ambiguous: true }])
    expect(readNumber('12.345')).toEqual([{ cents: 1234500, mark: 'comma', ambiguous: true }])
  })

  it('reads repeated grouping as thousands without calling it ambiguous', () => {
    expect(readNumber('1.000.000')).toEqual([{ cents: 100_000_000, mark: 'comma' }])
    expect(readNumber('1,000,000')).toEqual([{ cents: 100_000_000, mark: 'dot' }])
    expect(readNumber('1.234.567')).toEqual([])
    expect(readNumber('1.234.56')).toEqual([])
    expect(readNumber('1,234,56')).toEqual([])
  })

  it.each([
    '',
    'abc',
    '1..2',
    '1.2.3',
    '12.34,56',
    '1.234,567',
    '1,234.5,6',
    '1.2345',
    '0.123',
    '12345.678',
    '0',
    '0,00',
    '1.234.5',
  ])('finds no amount in %j', (core) => {
    expect(readNumber(core)).toEqual([])
  })

  it('keeps no candidate above the cap, or for a run too long to hold exactly', () => {
    expect(readNumber('1000000')).toEqual([{ cents: 100_000_000, mark: 'none' }])
    expect(readNumber('1000001')).toEqual([])
    expect(readNumber('12345678901234')).toEqual([])
  })
})
