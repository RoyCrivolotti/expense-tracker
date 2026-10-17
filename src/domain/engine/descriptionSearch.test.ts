import { describe, expect, it } from 'vitest'
import { descriptionCollator, inSuggestionOrder, localeIsSupported, prefixUpperBound } from './descriptionSearch'
import { mulberry32 } from './rng'

const keys = (items: Array<{ key: string }>) => items.map((i) => i.key)
const asItems = (...texts: string[]) => texts.map((key) => ({ key }))

describe('inSuggestionOrder', () => {
  const collator = descriptionCollator()

  it('puts base letters in alphabetical order whatever their accents or case', () => {
    expect(keys(inSuggestionOrder(asItems('zebra', 'éclair', 'apple', 'ñandú', 'eagle'), collator))).toEqual([
      'apple',
      'eagle',
      'éclair',
      'ñandú',
      'zebra',
    ])
  })

  it('orders descriptions the collator calls equal by their text, so arrival order does not matter', () => {
    const tied = asItems('cafe', 'cafè', 'café')
    expect(collator.compare('cafe', 'café')).toBe(0)
    const expected = ['cafe', 'cafè', 'café']
    expect(keys(inSuggestionOrder(tied, collator))).toEqual(expected)
    expect(keys(inSuggestionOrder([...tied].reverse(), collator))).toEqual(expected)
    expect(keys(inSuggestionOrder([tied[1]!, tied[2]!, tied[0]!], collator))).toEqual(expected)
  })

  it('does not change what it is given', () => {
    const given = asItems('b', 'a')
    inSuggestionOrder(given, collator)
    expect(keys(given)).toEqual(['b', 'a'])
  })

  it('sorts by the locale it is given: Swedish puts ä after z, English among the a', () => {
    const letters = asItems('ärlig', 'zebra', 'apa')
    expect(keys(inSuggestionOrder(letters, descriptionCollator('en')))).toEqual(['apa', 'ärlig', 'zebra'])
    expect(keys(inSuggestionOrder(letters, descriptionCollator('sv')))).toEqual(['apa', 'zebra', 'ärlig'])
  })

  it('gives the first n of any subset among the first n of the whole', () => {
    const rnd = mulberry32(5)
    const alphabet = ['a', 'á', 'b', 'c', 'ç', 'é', 'e', 'ñ', 'n', ' ', '-']
    const word = () => Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => alphabet[Math.floor(rnd() * alphabet.length)]!).join('')
    for (let round = 0; round < 50; round += 1) {
      const all = [...new Set(Array.from({ length: 40 }, word))].map((key) => ({ key }))
      const subset = all.filter(() => rnd() < 0.5)
      const n = 1 + Math.floor(rnd() * 8)
      const firstOfWhole = new Set(keys(inSuggestionOrder(all, collator).slice(0, n)))
      const firstOfSubset = keys(inSuggestionOrder(subset, collator).slice(0, n))
      // Whatever is in the first n of the subset and in the first n of the whole is in both orders alike.
      const inBoth = firstOfSubset.filter((k) => firstOfWhole.has(k))
      expect(keys(inSuggestionOrder(all, collator)).filter((k) => inBoth.includes(k))).toEqual(
        keys(inSuggestionOrder(subset, collator)).filter((k) => inBoth.includes(k)),
      )
    }
  })
})

describe('prefixUpperBound', () => {
  it('is the prefix with its last character raised by one', () => {
    expect(prefixUpperBound('ab')).toBe('ac')
    expect(prefixUpperBound('café')).toBe('cafê')
    expect(prefixUpperBound('🍕')).toBe('\u{1F356}')
  })

  it('steps over the surrogate range, which text cannot hold', () => {
    expect(prefixUpperBound('a퟿')).toBe('a')
  })

  it('drops a last character that cannot be raised, and has no bound when none can', () => {
    expect(prefixUpperBound('a\u{10FFFF}')).toBe('b')
    expect(prefixUpperBound('\u{10FFFF}\u{10FFFF}')).toBeNull()
    expect(prefixUpperBound('')).toBeNull()
  })

  it('bounds exactly the strings that start with the prefix, in the order SQLite compares text', () => {
    const rnd = mulberry32(11)
    const alphabet = ['a', 'b', 'é', '\u{10FFFF}', '🍕', '퟿', '', '\u0000'.replace('\u0000', 'z')]
    const text = (max: number) => Array.from({ length: Math.floor(rnd() * max) }, () => alphabet[Math.floor(rnd() * alphabet.length)]!).join('')
    const bytes = (s: string) => Buffer.from(s, 'utf8')
    for (let i = 0; i < 4_000; i += 1) {
      const prefix = text(3)
      const other = text(5)
      const upper = prefixUpperBound(prefix)
      const inRange = Buffer.compare(bytes(other), bytes(prefix)) >= 0 && (upper === null || Buffer.compare(bytes(other), bytes(upper)) < 0)
      expect(inRange, JSON.stringify([prefix, other])).toBe(other.startsWith(prefix))
    }
  })
})

describe('localeIsSupported', () => {
  it('accepts language tags the runtime has data for', () => {
    expect(localeIsSupported('en')).toBe(true)
    expect(localeIsSupported('sv-SE')).toBe(true)
  })

  it('refuses text that is not a tag, and a tag nothing is known about', () => {
    expect(localeIsSupported('not a tag')).toBe(false)
    expect(localeIsSupported('')).toBe(false)
    expect(localeIsSupported('x'.repeat(40))).toBe(false)
  })
})
