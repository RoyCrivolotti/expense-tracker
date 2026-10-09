import type { RentVsBuyPoint, RentVsBuyVerdict } from '../../../../engine'

type Standing = Pick<RentVsBuyPoint, 'year' | 'rentNetWorthCents' | 'buyNetWorthCents'>

const years = (n: number) => (n === 1 ? '1 year' : `${n} years`)

/** Who is ahead, in a sentence that names the years since buying: the first draw is not a breakeven if buying falls behind again. */
export function rentVsBuyHeadline(
  verdict: RentVsBuyVerdict | null,
  last: Standing | undefined,
  formatGap: (cents: number) => string,
): string {
  switch (verdict?.kind) {
    case 'buy-ahead':
      return 'Buying stays ahead of renting the whole way.'
    case 'buy-takes-over':
      return `Buying overtakes renting ${years(verdict.year)} after you buy and stays ahead to the end.`
    case 'rent-takes-over': {
      const first = verdict.buyAheadThrough === 1 ? 'the first year' : `the first ${verdict.buyAheadThrough} years`
      const by = last ? `, by ${formatGap(last.rentNetWorthCents - last.buyNetWorthCents)} after ${years(last.year)}` : ''
      return `Buying is ahead for ${first} after you buy, then renting leads for the rest${by}.`
    }
    default:
      return 'Renting and investing stays ahead the whole way.'
  }
}
