import { describe, expect, it } from 'vitest'
import { MALFORMED_SOURCE, MAX_SOURCES_PER_OWNER, isSourceWord, sourceWordOf } from './source'

describe('isSourceWord', () => {
  it.each(['iberia', 'a', 'bank-2', '0', 'my-bank-', 'a'.repeat(32)])('accepts %s', (word) => {
    expect(isSourceWord(word)).toBe(true)
  })

  it.each([
    ['empty', ''],
    ['a hyphen alone, the word unreadable requests are counted under', MALFORMED_SOURCE],
    ['a leading hyphen', '-bank'],
    ['33 characters', 'a'.repeat(33)],
    ['uppercase', 'Iberia'],
    ['a space', 'my bank'],
    ['a trailing newline', 'iberia\n'],
    ['an accent', 'bañco'],
    ['a look-alike letter', 'ibеria'],
    ['an underscore', 'my_bank'],
    ['a path', '../iberia'],
    ['a slash', 'a/b'],
    ['SQL', "x'; DROP TABLE capture_events;--"],
    ['a null byte', 'a\0b'],
    ['a number', 5],
    ['null', null],
    ['undefined', undefined],
    ['an object', { toString: () => 'iberia' }],
  ])('refuses %s', (_name, word) => {
    expect(isSourceWord(word)).toBe(false)
  })

  it('allows a handful of sources per person', () => {
    expect(MAX_SOURCES_PER_OWNER).toBe(8)
  })
})

describe('sourceWordOf', () => {
  it.each([
    ['SampleCards', 'samplecards'],
    ['Example Bank', 'example-bank'],
    ['Bank 24 Online', 'bank-24-online'],
    ['Banco Ñandú', 'banco-nandu'],
    ['  My   Bank!  ', 'my-bank'],
    ['Bank & Co.', 'bank-co'],
    ['ＢＡＮＫ', 'bank'],
    ['a'.repeat(40), 'a'.repeat(32)],
    [`${'a'.repeat(31)} b`, 'a'.repeat(31)],
  ])('folds %j to %s', (app, word) => {
    expect(sourceWordOf(app)).toBe(word)
    expect(isSourceWord(word)).toBe(true)
  })

  it.each(['', '   ', '!!!', '\u2014', '🏦', '\u200f'])('gives no word for %j', (app) => {
    expect(sourceWordOf(app)).toBeNull()
  })
})
