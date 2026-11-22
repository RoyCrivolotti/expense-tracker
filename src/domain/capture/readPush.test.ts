import { describe, expect, it } from 'vitest'
import { readPush, spanText } from './readPush'
import { siblingSlot, skeletonOf } from './shape'
import { readPushSlots } from './slots'

describe('readPush', () => {
  it('reads the words, slots, skeleton and amount of a push in one go', () => {
    const read = readPush('Card payment', 'Paid 12,50 EUR at Example Cafe with card **4821')
    expect(read.tokens).toEqual([
      'Card',
      'payment',
      'Paid',
      '12,50',
      'EUR',
      'at',
      'Example',
      'Cafe',
      'with',
      'card',
      '**4821',
    ])
    expect(read.skeleton).toBe('card payment paid <N> <C> at example cafe with card <D>')
    expect(read.titleSkeleton).toBe('card payment')
    expect(read.currencyAmount?.candidates[0]?.cents).toBe(1250)
    expect(read.slots).toEqual(readPushSlots('Card payment', 'Paid 12,50 EUR at Example Cafe with card **4821'))
  })

  it('gives the skeleton skeletonOf gives, for every push', () => {
    for (const [title, body] of [
      ['Pago', 'de 50,00EUR en EXAMPLE'],
      ['Aviso ÁÉ', 'tú comprá ́ €12 a las 09:41'],
      ['', ''],
      ['Only a title 2026-11-20', ''],
    ] as const) {
      expect(readPush(title, body).skeleton).toBe(skeletonOf(title, body, readPushSlots(title, body)))
    }
  })

  it('maps every skeleton token back to the word it came from, through a glued marker and a dropped word', () => {
    const read = readPush('Pago', 'de 50,00EUR ́ en Example Shop')
    expect(read.skeletonTokens).toEqual(['pago', 'de', '<N>', '<C>', 'en', 'example', 'shop'])
    expect(read.origin).toEqual([0, 1, 2, 2, 4, 5, 6])
    expect(read.tokens[4]).toBe('en')
  })

  it('masks a number in the title, so the title of two pushes of one template is the same', () => {
    expect(readPush('Paid 4,50 EUR', 'at Example').titleSkeleton).toBe(
      readPush('Paid 19,99 EUR', 'at Other').titleSkeleton,
    )
  })

  it('has no amount for a push with no currency marker, as a one-time code', () => {
    expect(readPush('Your code', 'Use 482913 to confirm').currencyAmount).toBeNull()
  })
})

describe('spanText', () => {
  const first = readPush('Card payment', 'Paid 12,50 EUR at Example Cafe, card **4821')
  const second = readPush('Card payment', 'Paid 3,00 EUR at "Sample Books Ltd", card **4821')

  it('gives the words of a run as written, with the punctuation around them taken off', () => {
    const runs = siblingSlot(first.skeletonTokens, second.skeletonTokens)
    expect(runs).not.toBeNull()
    if (!runs) return
    expect(spanText(first, runs.a)).toBe('Example Cafe')
    expect(spanText(second, runs.b)).toBe('Sample Books Ltd')
  })

  it('keeps a dot that belongs to the name', () => {
    const read = readPush('Pago', 'en Example S.L.')
    expect(spanText(read, { start: 2, end: 4 })).toBe('Example S.L.')
  })

  it('is empty for an empty run or one outside the push', () => {
    expect(spanText(first, { start: 3, end: 3 })).toBe('')
    expect(spanText(first, { start: 40, end: 41 })).toBe('')
  })

  it('takes the whole word when a run ends inside a number with a glued marker', () => {
    const read = readPush('Pago', 'de 50,00EUR en')
    expect(spanText(read, { start: 2, end: 3 })).toBe('50,00EUR')
  })
})
