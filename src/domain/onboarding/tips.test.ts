import { describe, expect, it } from 'vitest'
import {
  TIPS_SEEN_MAX,
  isEstablished,
  isTipSeen,
  parseTipsSeen,
  tipsSeenError,
  tipsSeenField,
  withTipSeen,
} from './tips'

describe('the three states of the saved list', () => {
  it('counts a missing list on an account with transactions as established: every tip is seen', () => {
    expect(isEstablished(undefined, true)).toBe(true)
    expect(isTipSeen(undefined, 'getting-started', true)).toBe(true)
  })

  it('counts a missing list on an account with none as new: nothing is seen', () => {
    expect(isEstablished(undefined, false)).toBe(false)
    expect(isTipSeen(undefined, 'getting-started', false)).toBe(false)
  })

  it('counts an empty list as a new person, even once the account has transactions', () => {
    expect(isEstablished([], true)).toBe(false)
    expect(isTipSeen([], 'getting-started', true)).toBe(false)
  })

  it('counts only the listed tips as seen when a list is saved', () => {
    expect(isTipSeen(['getting-started'], 'getting-started', true)).toBe(true)
    expect(isTipSeen(['getting-started'], 'other-tip', true)).toBe(false)
  })
})

describe('withTipSeen', () => {
  it('adds a tip to what is saved and what this visit has put away, once each', () => {
    expect(withTipSeen(['a'], new Set(['b', 'a']), 'c')).toEqual(['a', 'b', 'c'])
  })

  it('starts a list for an account that has none saved', () => {
    expect(withTipSeen(undefined, [], 'a')).toEqual(['a'])
  })
})

describe('what is read back from a row', () => {
  it('leaves the field out for a column never written, which is not an empty list', () => {
    expect(tipsSeenField(null)).toEqual({})
    expect(tipsSeenField(undefined)).toEqual({})
    expect(tipsSeenField('[]')).toEqual({ tipsSeen: [] })
  })

  it('reads a list, drops what is not text and repeats, and treats damage as never written', () => {
    expect(parseTipsSeen('["a",3,"a","b"]')).toEqual(['a', 'b'])
    expect(parseTipsSeen('{"a":1}')).toBeUndefined()
    expect(parseTipsSeen('not json')).toBeUndefined()
  })
})

describe('tipsSeenError', () => {
  it('accepts a list of ids, empty included', () => {
    expect(tipsSeenError([])).toBeNull()
    expect(tipsSeenError(['getting-started', 'goals-intro'])).toBeNull()
  })

  it('refuses what is not a list, an id that is not a word, an id too long and too long a list', () => {
    expect(tipsSeenError('getting-started')).not.toBeNull()
    expect(tipsSeenError(null)).not.toBeNull()
    expect(tipsSeenError([3])).not.toBeNull()
    expect(tipsSeenError(['Not A Tip'])).not.toBeNull()
    expect(tipsSeenError(['a'.repeat(41)])).not.toBeNull()
    expect(tipsSeenError(Array.from({ length: TIPS_SEEN_MAX + 1 }, (_, i) => `tip-${i}`))).not.toBeNull()
  })
})
