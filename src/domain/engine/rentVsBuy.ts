/**
 * Rent-vs-buy: a symmetric net-worth comparison of buying now versus renting
 * and investing the difference. Higher net worth wins; the crossover year is
 * the breakeven where buying pulls ahead.
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
 * real terms, both side portfolios earn the same real return, and selling costs
 * are ignored.
 */
import { monthlyMortgageCents, projectNetWorth, type ProjectionParams } from './projection'
import { DEFAULT_HOME_CARRY_RATE } from './projectionConstants'

export interface RentVsBuyPoint {
  year: number
  rentNetWorthCents: number
  buyNetWorthCents: number
}

export interface RentVsBuyResult {
  points: RentVsBuyPoint[]
  breakevenYear: number | null
}

export interface RentVsBuyInput {
  params: ProjectionParams
  rentMonthlyCents: number
  carryRate?: number
}

export function projectRentVsBuy(input: RentVsBuyInput): RentVsBuyResult {
  const { params, rentMonthlyCents } = input
  const carryRate = input.carryRate ?? DEFAULT_HOME_CARRY_RATE
  if (params.housePriceCents <= 0) return { points: [], breakevenYear: null }

  const buyNow: ProjectionParams = { ...params, housePurchaseYear: 0 }
  const yearPoints = projectNetWorth(buyNow)
  const r = params.expectedRealReturn
  const annualMortgageCents = monthlyMortgageCents(buyNow) * 12
  const annualRentCents = rentMonthlyCents * 12

  let rentPortfolio =
    Math.round(params.housePriceCents * params.downPaymentFraction) + params.transactionCostsCents
  let buyPortfolio = 0
  const points: RentVsBuyPoint[] = []
  let breakevenYear: number | null = null

  for (let t = 0; t < yearPoints.length; t++) {
    const point = yearPoints[t]
    if (!point) continue
    if (t > 0) {
      rentPortfolio = Math.round(rentPortfolio * (1 + r))
      buyPortfolio = Math.round(buyPortfolio * (1 + r))
      const buyerOutlay =
        (t <= params.mortgageTermYears ? annualMortgageCents : 0) +
        Math.round(point.houseEquityCents * carryRate)
      const surplus = buyerOutlay - annualRentCents
      if (surplus > 0) rentPortfolio += surplus
      else buyPortfolio += -surplus
    }
    const equity = point.houseEquityCents - point.mortgageBalanceCents
    const buyNetWorthCents = buyPortfolio + equity
    points.push({ year: t, rentNetWorthCents: rentPortfolio, buyNetWorthCents })
    if (breakevenYear === null && t > 0 && buyNetWorthCents >= rentPortfolio) breakevenYear = t
  }

  return { points, breakevenYear }
}
