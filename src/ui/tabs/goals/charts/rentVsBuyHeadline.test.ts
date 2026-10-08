import { describe, expect, it } from 'vitest'
import { rentVsBuyHeadline } from './rentVsBuyHeadline'

describe('rentVsBuyHeadline', () => {
  const gap = (cents: number) => `${cents / 100} €`
  const last = { year: 30, rentNetWorthCents: 1_100_00, buyNetWorthCents: 463_00 }

  it('names each way the lead can fall', () => {
    expect(rentVsBuyHeadline({ kind: 'buy-ahead' }, last, gap)).toBe('Buying stays ahead of renting across the whole horizon.')
    expect(rentVsBuyHeadline({ kind: 'buy-takes-over', year: 7 }, last, gap)).toBe(
      'Buying overtakes renting in year 7 and stays ahead to the end.',
    )
    expect(rentVsBuyHeadline({ kind: 'rent-takes-over', buyAheadThrough: 4 }, last, gap)).toBe(
      'Buying is ahead through year 4, then renting leads for the rest of the horizon, by 637 € after 30 years.',
    )
    expect(rentVsBuyHeadline({ kind: 'rent-ahead' }, last, gap)).toBe('Renting and investing stays ahead across the whole horizon.')
    expect(rentVsBuyHeadline(null, undefined, gap)).toBe('Renting and investing stays ahead across the whole horizon.')
  })

  it('leaves the size of the lead out when there is no last year to read it from', () => {
    expect(rentVsBuyHeadline({ kind: 'rent-takes-over', buyAheadThrough: 4 }, undefined, gap)).toBe(
      'Buying is ahead through year 4, then renting leads for the rest of the horizon.',
    )
  })
})
