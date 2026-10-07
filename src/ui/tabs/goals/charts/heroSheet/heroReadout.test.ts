import { describe, expect, it } from 'vitest'
import { readoutSentence } from './heroReadout'

const money = (cents: number) => `${cents / 100} euros`

describe('readoutSentence', () => {
  it('says nothing until a year is pointed at', () => {
    expect(readoutSentence(null, [{ label: 'Path A', color: '#000', valueCents: 100 }], false, money)).toBe('')
  })

  it('reads the year and each line that has a value in it', () => {
    const items = [
      { label: 'Path A', color: '#000', valueCents: 120_000 },
      { label: 'Path B', color: '#111', valueCents: 98_000 },
    ]
    expect(readoutSentence(12, items, false, money)).toBe('Year 12. Path A 1200 euros. Path B 980 euros.')
  })

  it('leaves out a line that is hidden or has stopped before the year', () => {
    const items = [
      { label: 'Path A', color: '#000', valueCents: 100 },
      { label: 'Hidden', color: '#111', valueCents: null, hidden: true },
      { label: 'Ended', color: '#222', valueCents: null, outOfRun: true },
    ]
    expect(readoutSentence(3, items, false, money)).toBe('Year 3. Path A 1 euros.')
  })

  it('says when it is a purchase year', () => {
    expect(readoutSentence(8, [], true, money)).toBe('Year 8. A purchase year.')
  })
})
