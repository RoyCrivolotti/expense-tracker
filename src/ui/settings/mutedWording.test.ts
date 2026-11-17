import { describe, expect, it } from 'vitest'
import { wordingParts, wordingText } from './mutedWording'

describe('wordingParts', () => {
  it('names each placeholder and joins the words between them', () => {
    expect(wordingParts('card used you spent <N> <C> at <M> card <D> on <DATE> ref <X> code <CODE>')).toEqual([
      { text: 'card used you spent' },
      { slot: 'number' },
      { slot: 'currency' },
      { text: 'at' },
      { slot: 'merchant' },
      { text: 'card' },
      { slot: 'card' },
      { text: 'on' },
      { slot: 'date' },
      { text: 'ref' },
      { slot: 'number' },
      { text: 'code' },
      { slot: 'code' },
    ])
  })

  it('keeps a token that only looks like a placeholder as text, and gives nothing for an empty skeleton', () => {
    expect(wordingParts('save <NOW>')).toEqual([{ text: 'save <NOW>' }])
    expect(wordingParts('')).toEqual([])
  })
})

describe('wordingText', () => {
  it('says each slot by its name between the words', () => {
    expect(wordingText('paid <N> <C> at <M>')).toBe('paid number currency at merchant')
  })
})
