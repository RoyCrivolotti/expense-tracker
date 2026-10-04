import { describe, expect, it } from 'vitest'
import { parseMonths } from './parseMonths'

describe('parseMonths', () => {
  it.each([
    ['6', 6],
    ['0', 0],
    ['  12 ', 12],
    ['06', 6],
    ['6.0', 6],
    ['6,0', 6],
    ['6,00', 6],
  ])('reads %j as %d months', (text, months) => {
    expect(parseMonths(text)).toBe(months)
  })

  it.each([
    [''],
    ['  '],
    ['abc'],
    ['1e1'],
    ['0x10'],
    ['2.5'],
    ['2,5'],
    ['-3'],
    ['+3'],
    ['6.'],
    ['.5'],
    ['1,000'],
    ['6 months'],
  ])('refuses %j', (text) => {
    expect(parseMonths(text)).toBeNull()
  })
})
