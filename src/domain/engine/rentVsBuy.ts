/**
 * Rent-vs-buy: a symmetric net-worth comparison of buying versus renting and investing the
 * difference, from the year the plan buys (or from today when it buys no time soon). Higher net
 * worth wins; `rentVsBuyVerdict` says who is ahead and from when, since buying can lead early and fall
 * behind for good.
 *
 * Both parties are modelled fairly. They start with the same cash and spend the same in total on
 * housing and investing each year: the renter starts by investing the cash a buyer would sink into the
 * down payment and transaction costs, and each year the party with the lower housing outlay invests
 * the surplus at the real return. The buyer also accrues home equity (appreciation + principal paid
 * down).
 *
 * Net worth(buy, t) = savings + house worth(t) - loan left(t).
 * Net worth(rent, t) = the start cash grown at the return + what was invested since (no equity).
 *
 * Years count from the purchase, so the comparison is the same whatever year the plan buys in apart
 * from the price, which has risen to what the house costs then. It runs until ten years after the loan
 * is paid off, which is where the buyer's month changes most.
 *
 * Simplifications (documented for honesty): rent and carry costs are constant in the plan's euros, both side
 * portfolios earn the same real return, and selling costs are ignored.
 */
import { pmt } from './finance'
import { housePriceAtPurchaseCents } from './housePrice'
import { monthlyMortgageCents, projectNetWorth, type ProjectionParams, type YearPoint } from './projection'
import { DEFAULT_HOME_CARRY_RATE } from './projectionConstants'

/**
 * One year of the comparison, in the plan's money. `year` counts from the purchase. The monthly figures
 * are what the year just ended cost and put in, and are nothing at year 0, which has no year behind it.
 */
export interface RentVsBuyPoint {
  year: number
  rentNetWorthCents: number
  buyNetWorthCents: number
  /** The renter's start cash grown at the real return: what it would be had nothing been added. */
  rentSeedCents: number
  /** What the renter has put in since, with what it earned: the net worth less the grown start cash. */
  rentExtraCents: number
  houseValueCents: number
  loanLeftCents: number
  /** What the buyer has invested, which is whatever rent would have cost over owning. */
  buySavingsCents: number
  rentHousingMonthlyCents: number
  buyHousingMonthlyCents: number
  rentInvestsMonthlyCents: number
  buyInvestsMonthlyCents: number
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
  /** The year after buying at which buying gets ahead of renting and stays ahead to the end; null when it does not. */
  breakevenYear: number | null
  /** Null with no comparison to make (no house price). */
  verdict: RentVsBuyVerdict | null
  /** The plan year the comparison starts in: the purchase year, or 0 when the house is bought today, owned or not planned. */
  startYear: number
  /** What the house costs on the day, in the plan's money: today's price, grown to the purchase year. */
  priceCents: number
  /** The cash both sides start with: the down payment and the fees. */
  upfrontCents: number
  /** The first year after buying that owning costs the buyer less a month than renting, and whether it stays so; null when it never does. */
  ownCheaper: { fromYear: number; stays: boolean } | null
  /** The year after buying the loan is paid off; null when there is no loan. */
  loanPaidOffYear: number | null
  /** The bank's monthly payment as it is on the account, in the euros of the purchase day; fixed for the loan. */
  paymentOnAccountCents: number
}

const NO_COMPARISON: RentVsBuyResult = {
  points: [],
  breakevenYear: null,
  verdict: null,
  startYear: 0,
  priceCents: 0,
  upfrontCents: 0,
  ownCheaper: null,
  loanPaidOffYear: null,
  paymentOnAccountCents: 0,
}

/** Who leads in each year after the first purchase year, and how the lead changes hands. */
export function rentVsBuyVerdict(
  points: readonly Pick<RentVsBuyPoint, 'year' | 'rentNetWorthCents' | 'buyNetWorthCents'>[],
): RentVsBuyVerdict | null {
  const years = points.filter((p) => p.year > 0)
  if (years.length === 0) return null
  const buyLeads = (p: (typeof years)[number]) => p.buyNetWorthCents >= p.rentNetWorthCents
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

/** Years the comparison runs past the end of the loan, which is where the buyer's month changes most. */
const YEARS_PAST_PAYOFF = 10
/** The longest it runs, however long the loan is. */
const MAX_RUN_YEARS = 60

/** How many years after buying the comparison runs for a loan of this many years. */
export function rentVsBuyRunYears(termYears: number): number {
  const term = Number.isFinite(termYears) && termYears > 0 ? Math.ceil(termYears) : 0
  return Math.min(MAX_RUN_YEARS, term + YEARS_PAST_PAYOFF)
}

/** What the buyer pays in housing over year `t`, in the plan's money: the loan, which is fixed in the bank's euros, and the upkeep. */
function buyerOutlayCents(
  t: number,
  houseValueCents: number,
  annualMortgageCents: number,
  params: ProjectionParams,
  carryRate: number,
): number {
  const loan = (annualMortgageCents * paidShareOfYear(t, params.mortgageTermYears)) / Math.pow(1 + params.inflationRate, t)
  return Math.round(loan) + Math.round(houseValueCents * carryRate)
}

const perMonth = (annualCents: number) => Math.round(annualCents / 12)

/** The first year owning is cheaper by the month than renting, and whether every year after it is too. */
function ownCheaperFrom(points: readonly RentVsBuyPoint[]): RentVsBuyResult['ownCheaper'] {
  const years = points.filter((p) => p.year > 0)
  const cheaper = (p: RentVsBuyPoint) => p.buyHousingMonthlyCents < p.rentHousingMonthlyCents
  const first = years.find(cheaper)
  if (!first) return null
  return { fromYear: first.year, stays: years.filter((p) => p.year >= first.year).every(cheaper) }
}

/** The bank's payment on the day of the purchase: the loan in that day's euros, paid over the term. */
function paymentOnAccountCents(loanCents: number, purchaseYear: number, params: ProjectionParams): number {
  if (loanCents <= 0) return 0
  const nominalLoan = loanCents * Math.pow(1 + params.inflationRate, purchaseYear)
  return Math.round(pmt(params.mortgageRateAnnual / 12, params.mortgageTermYears * 12, nominalLoan))
}

/** What each side has invested. */
interface Portfolios {
  rent: number
  buy: number
}

/** A year on: both portfolios earn the real return, then whichever side pays less in housing invests the difference. */
function endOfYear(books: Portfolios, returnRate: number, surplus: number): Portfolios {
  const rent = Math.round(books.rent * (1 + returnRate))
  const buy = Math.round(books.buy * (1 + returnRate))
  return surplus > 0 ? { rent: rent + surplus, buy } : { rent, buy: buy - surplus }
}

/** The plan year the comparison starts in: the purchase year, or today for a house owned, bought today or not planned. */
function startYearOf(params: ProjectionParams): number {
  return params.housePurchaseYear !== null && params.housePurchaseYear > 0 ? params.housePurchaseYear : 0
}

/** The year buying gets ahead for good, which a verdict that has buying ahead throughout puts at the first year. */
function breakevenOf(verdict: RentVsBuyVerdict | null): number | null {
  if (verdict?.kind === 'buy-takes-over') return verdict.year
  return verdict?.kind === 'buy-ahead' ? 1 : null
}

interface YearContext {
  rentMonthlyCents: number
  annualMortgageCents: number
  carryRate: number
  upfrontCents: number
  params: ProjectionParams
}

interface YearFlows {
  outlay: number
  surplus: number
}

/** What the buyer pays in housing over the year against the rent, and so who invests the difference. */
function yearFlows(point: YearPoint, c: YearContext): YearFlows {
  if (point.year <= 0) return { outlay: 0, surplus: 0 }
  const outlay = buyerOutlayCents(point.year, point.houseEquityCents, c.annualMortgageCents, c.params, c.carryRate)
  return { outlay, surplus: outlay - c.rentMonthlyCents * 12 }
}

function pointOf(point: YearPoint, books: Portfolios, flows: YearFlows, c: YearContext): RentVsBuyPoint {
  const seed = Math.round(c.upfrontCents * Math.pow(1 + c.params.expectedRealReturn, point.year))
  return {
    year: point.year,
    rentNetWorthCents: books.rent,
    buyNetWorthCents: books.buy + point.houseEquityCents - point.mortgageBalanceCents,
    rentSeedCents: seed,
    rentExtraCents: books.rent - seed,
    houseValueCents: point.houseEquityCents,
    loanLeftCents: point.mortgageBalanceCents,
    buySavingsCents: books.buy,
    rentHousingMonthlyCents: point.year > 0 ? c.rentMonthlyCents : 0,
    buyHousingMonthlyCents: perMonth(flows.outlay),
    rentInvestsMonthlyCents: perMonth(Math.max(0, flows.surplus)),
    buyInvestsMonthlyCents: perMonth(Math.max(0, -flows.surplus)),
  }
}

export function projectRentVsBuy(input: RentVsBuyInput): RentVsBuyResult {
  const { params } = input
  if (params.housePriceCents <= 0) return NO_COMPARISON

  // Bought in year Y at the price the house has risen to, which is the same comparison as buying
  // today at that price: years count from the purchase, the payment shrinks from the day it starts,
  // and the plan's money is the one the price is in.
  const startYear = startYearOf(params)
  const priceCents = housePriceAtPurchaseCents(params)
  const buyNow: ProjectionParams = {
    ...params,
    housePriceCents: priceCents,
    housePurchaseYear: 0,
    horizonYears: rentVsBuyRunYears(params.mortgageTermYears),
  }
  const context: YearContext = {
    rentMonthlyCents: input.rentMonthlyCents,
    annualMortgageCents: monthlyMortgageCents(buyNow) * 12,
    carryRate: input.carryRate ?? DEFAULT_HOME_CARRY_RATE,
    upfrontCents: Math.round(priceCents * params.downPaymentFraction) + params.transactionCostsCents,
    params,
  }

  let books: Portfolios = { rent: context.upfrontCents, buy: 0 }
  const points: RentVsBuyPoint[] = []
  for (const point of projectNetWorth(buyNow)) {
    const flows = yearFlows(point, context)
    if (point.year > 0) books = endOfYear(books, params.expectedRealReturn, flows.surplus)
    points.push(pointOf(point, books, flows, context))
  }

  const verdict = rentVsBuyVerdict(points)
  const loan = priceCents - Math.round(priceCents * params.downPaymentFraction)
  return {
    points,
    breakevenYear: breakevenOf(verdict),
    verdict,
    startYear,
    priceCents,
    upfrontCents: context.upfrontCents,
    ownCheaper: ownCheaperFrom(points),
    loanPaidOffYear: loan > 0 ? params.mortgageTermYears : null,
    paymentOnAccountCents: paymentOnAccountCents(loan, startYear, params),
  }
}
