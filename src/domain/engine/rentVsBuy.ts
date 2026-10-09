/**
 * Rent-vs-buy: a symmetric net-worth comparison of buying now versus renting
 * and investing the difference. Higher net worth wins; `rentVsBuyVerdict` says who is
 * ahead and from when, since buying can lead early and fall behind for good.
 *
 * Both parties are modelled fairly. The renter starts by investing the cash a
 * buyer would sink into the down payment and transaction costs. Each year, the
 * party with the lower housing outlay invests the surplus at the real return.
 * The buyer also accrues home equity (appreciation + principal paid down).
 *
 * Net worth(buy, t) = side portfolio + home equity(t).
 * Net worth(rent, t) = side portfolio (no equity).
 *
 * Simplifications (documented for honesty): rent and carry costs are constant in
 * today's money, both side portfolios earn the same real return, and selling costs
 * are ignored.
 */
import { monthlyMortgageCents, projectNetWorth, type ProjectionParams } from './projection'
import { DEFAULT_HOME_CARRY_RATE } from './projectionConstants'

export interface RentVsBuyPoint {
  year: number
  rentNetWorthCents: number
  buyNetWorthCents: number
}

/**
 * Who is ahead over the horizon, said so that it cannot be read as more than it is. Buying can
 * lead for a few years (the renter pays the purchase costs first and the owner's equity grows with
 * the repayments) and fall behind for the rest, so the first year it draws level is not a
 * breakeven: this names the year buying stays ahead from, or the last year it was ahead.
 */
export type RentVsBuyVerdict =
  | { kind: 'rent-ahead' }
  | { kind: 'buy-ahead' }
  | { kind: 'buy-takes-over'; year: number }
  | { kind: 'rent-takes-over'; buyAheadThrough: number }

export interface RentVsBuyResult {
  points: RentVsBuyPoint[]
  /** The year buying gets ahead of renting and stays ahead to the end; null when it does not. */
  breakevenYear: number | null
  /** Null with no comparison to make (no house price). */
  verdict: RentVsBuyVerdict | null
}

/** Who leads in each year after the first purchase year, and how the lead changes hands. */
export function rentVsBuyVerdict(points: readonly RentVsBuyPoint[]): RentVsBuyVerdict | null {
  const years = points.filter((p) => p.year > 0)
  if (years.length === 0) return null
  const buyLeads = (p: RentVsBuyPoint) => p.buyNetWorthCents >= p.rentNetWorthCents
  const ahead = years.filter(buyLeads)
  if (ahead.length === years.length) return { kind: 'buy-ahead' }
  if (ahead.length === 0) return { kind: 'rent-ahead' }
  const last = years[years.length - 1]!
  if (buyLeads(last)) {
    const lastBehind = [...years].reverse().find((p) => !buyLeads(p))!
    return { kind: 'buy-takes-over', year: lastBehind.year + 1 }
  }
  return { kind: 'rent-takes-over', buyAheadThrough: ahead[ahead.length - 1]!.year }
}

export interface RentVsBuyInput {
  params: ProjectionParams
  rentMonthlyCents: number
  carryRate?: number
}

/** The share of year `t` the loan is still paid in: all of it, none of it, or the months left when it ends part way through one. */
export function paidShareOfYear(t: number, termYears: number): number {
  return Math.min(1, Math.max(0, termYears - (t - 1)))
}

export function projectRentVsBuy(input: RentVsBuyInput): RentVsBuyResult {
  const { params, rentMonthlyCents } = input
  const carryRate = input.carryRate ?? DEFAULT_HOME_CARRY_RATE
  if (params.housePriceCents <= 0) return { points: [], breakevenYear: null, verdict: null }

  const buyNow: ProjectionParams = { ...params, housePurchaseYear: 0 }
  const yearPoints = projectNetWorth(buyNow)
  const r = params.expectedRealReturn
  const annualMortgageCents = monthlyMortgageCents(buyNow) * 12
  const annualRentCents = rentMonthlyCents * 12

  let rentPortfolio =
    Math.round(params.housePriceCents * params.downPaymentFraction) + params.transactionCostsCents
  let buyPortfolio = 0
  const points: RentVsBuyPoint[] = []

  for (let t = 0; t < yearPoints.length; t++) {
    const point = yearPoints[t]
    if (!point) continue
    if (t > 0) {
      rentPortfolio = Math.round(rentPortfolio * (1 + r))
      buyPortfolio = Math.round(buyPortfolio * (1 + r))
      // The payment is fixed in the bank's money, so in today's it shrinks each year, while
      // rent is held constant in today's money.
      const buyerOutlay =
        Math.round((annualMortgageCents * paidShareOfYear(t, params.mortgageTermYears)) / Math.pow(1 + params.inflationRate, t)) +
        Math.round(point.houseEquityCents * carryRate)
      const surplus = buyerOutlay - annualRentCents
      if (surplus > 0) rentPortfolio += surplus
      else buyPortfolio += -surplus
    }
    const equity = point.houseEquityCents - point.mortgageBalanceCents
    const buyNetWorthCents = buyPortfolio + equity
    points.push({ year: t, rentNetWorthCents: rentPortfolio, buyNetWorthCents })
  }

  const verdict = rentVsBuyVerdict(points)
  const breakevenYear =
    verdict?.kind === 'buy-takes-over' ? verdict.year : verdict?.kind === 'buy-ahead' ? 1 : null
  return { points, breakevenYear, verdict }
}
