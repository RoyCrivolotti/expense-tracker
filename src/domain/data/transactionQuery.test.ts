import { describe, expect, it } from 'vitest'
import { caseFolds } from './transactionQuery'

describe('caseFolds', () => {
  it('has nothing to fold in plain ASCII, which SQLite already lower-cases', () => {
    expect(caseFolds('grocery store 42 %_')).toEqual([])
  })

  it('pairs each non-ASCII letter with its capital, once', () => {
    expect(caseFolds('café ñandú')).toEqual([
      ['É', 'é'],
      ['Ñ', 'ñ'],
      ['Ú', 'ú'],
    ])
    expect(caseFolds('éé é')).toEqual([['É', 'é']])
    expect(caseFolds('москва')).toContainEqual(['М', 'м'])
  })

  it('leaves out letters with no capital and ones whose capital is not a single letter', () => {
    expect(caseFolds('日本語')).toEqual([])
    expect(caseFolds('ß')).toEqual([])
    expect(caseFolds('ﬁ')).toEqual([])
  })

  it('does not fold a capital, since the caller lower-cases first', () => {
    expect(caseFolds('É')).toEqual([])
  })
})
