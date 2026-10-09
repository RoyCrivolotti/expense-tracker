import type { RentVsBuyPoint, RentVsBuyVerdict } from '../../../../engine'

type Standing = Pick<RentVsBuyPoint, 'year' | 'rentNetWorthCents' | 'buyNetWorthCents'>

const years = (n: number) => (n === 1 ? '1 year' : `${n} years`)

/** Who is ahead, in a sentence that names the years since buying: the first draw is not a breakeven if the lead changes hands again. */
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
      // The last year buying led is not a run of leading years from the first: the buyer starts behind by the
      // fees and can trail in the opening years, so what is always true is when renting took over for good.
      const by = last ? `, by ${formatGap(last.rentNetWorthCents - last.buyNetWorthCents)} after ${years(last.year)}` : ''
      return `Renting overtakes buying ${years(verdict.buyAheadThrough + 1)} after you buy and stays ahead to the end${by}.`
    }
    default:
      return 'Renting and investing stays ahead the whole way.'
  }
}
