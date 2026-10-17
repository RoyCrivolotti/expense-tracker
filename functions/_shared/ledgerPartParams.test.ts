import { describe, expect, it } from 'vitest'
import { ValidationError } from '../domain/application/validationError'
import { monthRangeParams, singleParams } from './ledgerPartParams'

const url = (query: string) => new URL(`https://expenses.test/api/expenses/cube?${query}`)

describe('singleParams', () => {
  it('reads each allowed parameter once, and leaves the others undefined', () => {
    expect(singleParams(url('a=1'), ['a', 'b'])).toEqual({ a: '1', b: undefined })
  })

  it('counts a blank value as absent', () => {
    expect(singleParams(url('a=&b=2'), ['a', 'b'])).toEqual({ a: undefined, b: '2' })
  })

  it('refuses a parameter that is not allowed, so a misspelling is an error', () => {
    expect(() => singleParams(url('a=1&c=3'), ['a'])).toThrow('Unknown parameter: c')
    expect(() => singleParams(url('x'), [])).toThrow(ValidationError)
  })

  it('refuses a parameter given twice', () => {
    expect(() => singleParams(url('a=1&a=2'), ['a'])).toThrow('a was given more than once')
  })
})

describe('monthRangeParams', () => {
  it('reads from and to, and leaves out the ones that are missing', () => {
    expect(monthRangeParams(url('from=2026-01&to=2026-03'))).toEqual({ from: '2026-01', to: '2026-03' })
    expect(monthRangeParams(url('from=2026-01'))).toEqual({ from: '2026-01' })
    expect(monthRangeParams(url(''))).toEqual({})
  })
})
