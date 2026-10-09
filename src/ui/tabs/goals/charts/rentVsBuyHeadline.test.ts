import { describe, expect, it } from 'vitest'
import { rentVsBuyHeadline } from './rentVsBuyHeadline'

describe('rentVsBuyHeadline', () => {
  const gap = (cents: number) => `${cents / 100} €`
  const last = { year: 30, rentNetWorthCents: 1_100_00, buyNetWorthCents: 463_00 }

  it('names each way the lead can fall, in years after buying', () => {
    expect(rentVsBuyHeadline({ kind: 'buy-ahead' }, last, gap)).toBe('Buying stays ahead of renting the whole way.')
    expect(rentVsBuyHeadline({ kind: 'buy-takes-over', year: 7 }, last, gap)).toBe(
      'Buying overtakes renting 7 years after you buy and stays ahead to the end.',
    )
    expect(rentVsBuyHeadline({ kind: 'rent-takes-over', buyAheadThrough: 4 }, last, gap)).toBe(
      'Buying is ahead for the first 4 years after you buy, then renting leads for the rest, by 637 € after 30 years.',
    )
    expect(rentVsBuyHeadline({ kind: 'rent-ahead' }, last, gap)).toBe('Renting and investing stays ahead the whole way.')
    expect(rentVsBuyHeadline(null, undefined, gap)).toBe('Renting and investing stays ahead the whole way.')
  })

  it('says a year in the singular', () => {
    expect(rentVsBuyHeadline({ kind: 'buy-takes-over', year: 1 }, last, gap)).toBe(
      'Buying overtakes renting 1 year after you buy and stays ahead to the end.',
    )
    expect(rentVsBuyHeadline({ kind: 'rent-takes-over', buyAheadThrough: 1 }, undefined, gap)).toBe(
      'Buying is ahead for the first year after you buy, then renting leads for the rest.',
    )
  })

  it('leaves the size of the lead out when there is no last year to read it from', () => {
    expect(rentVsBuyHeadline({ kind: 'rent-takes-over', buyAheadThrough: 4 }, undefined, gap)).toBe(
      'Buying is ahead for the first 4 years after you buy, then renting leads for the rest.',
    )
  })
})
