/**
 * Spreadsheet-equivalent finance primitives (PMT, FV, NPER). All operate on
 * plain numbers (euros, fractional rates) so the goals layer can convert to and
 * from integer cents at its boundaries.
 */

/** Payment per period to amortize `pv` over `nper` periods at `rate`. */
export function pmt(rate: number, nper: number, pv: number): number {
  if (rate === 0) return pv / nper
  return (pv * rate) / (1 - Math.pow(1 + rate, -nper))
}

/**
 * Future value of `pv` plus an ordinary annuity of `pmtPerPeriod` over `nper`
 * periods at `rate` (payments at period end).
 */
export function fv(rate: number, nper: number, pmtPerPeriod: number, pv: number): number {
  if (rate === 0) return pv + pmtPerPeriod * nper
  const growth = Math.pow(1 + rate, nper)
  return pv * growth + pmtPerPeriod * ((growth - 1) / rate)
}

/**
 * Number of periods for `pv` plus an ordinary annuity of `pmtPerPeriod` to reach
 * `targetFv` at `rate`. Returns Infinity when the target can never be reached.
 */
export function nper(rate: number, pmtPerPeriod: number, pv: number, targetFv: number): number {
  if (rate === 0) {
    if (pmtPerPeriod === 0) return Infinity
    return (targetFv - pv) / pmtPerPeriod
  }
  const annuity = pmtPerPeriod / rate
  const numerator = targetFv + annuity
  const denominator = pv + annuity
  if (denominator <= 0 || numerator <= 0) return Infinity
  return Math.log(numerator / denominator) / Math.log(1 + rate)
}
