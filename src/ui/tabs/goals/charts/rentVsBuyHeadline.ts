import type { RentVsBuyPoint, RentVsBuyVerdict } from '../../../../engine'

/** Who is ahead, in a sentence that names the years: the first draw is not a breakeven if buying falls behind again. */
export function rentVsBuyHeadline(
  verdict: RentVsBuyVerdict | null,
  last: RentVsBuyPoint | undefined,
  formatGap: (cents: number) => string,
): string {
  switch (verdict?.kind) {
    case 'buy-ahead':
      return 'Buying stays ahead of renting across the whole horizon.'
    case 'buy-takes-over':
      return `Buying overtakes renting in year ${verdict.year} and stays ahead to the end.`
    case 'rent-takes-over':
      return `Buying is ahead through year ${verdict.buyAheadThrough}, then renting leads for the rest of the horizon${
        last ? `, by ${formatGap(last.rentNetWorthCents - last.buyNetWorthCents)} after ${last.year} years` : ''
      }.`
    default:
      return 'Renting and investing stays ahead across the whole horizon.'
  }
}
