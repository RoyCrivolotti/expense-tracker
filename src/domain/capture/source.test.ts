import { describe, expect, it } from 'vitest'
import { MAX_SOURCES_PER_OWNER, isSourceWord } from './source'

describe('isSourceWord', () => {
  it.each(['iberia', 'a', 'bank-2', '0', '-', 'a'.repeat(32)])('accepts %s', (word) => {
    expect(isSourceWord(word)).toBe(true)
  })

  it.each([
    ['empty', ''],
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
