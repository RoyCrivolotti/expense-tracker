/**
 * One year of the invested portfolio, shared by the plan and by anything that replays it with another
 * growth: the year's saving, what a house purchase and the life events do to it, and the step itself.
 * The plan and a replay at no spread must agree to the cent, which is why there is one step.
 */
import { annualContributionCents } from './contributionSchedule'
import { housePriceAtPurchaseCents } from './housePrice'
import type { ProjectionParams } from './projection'
import type { LifeEvent } from '../types'

/** What a year adds to the portfolio besides growth: its saving, and what lands on the anniversary. */
export interface YearFlows {
  /** The year's saving in the plan's money, paid in at the end of the year. */
  contributionCents: number
  /** The house payment (negative) and the life events of the year: the step on the anniversary. */
  eventsCents: number
}

function lifeEventImpact(events: LifeEvent[], year: number): number {
  let total = 0
  for (const ev of events) {
    if (ev.year === year) total += ev.amountCents
  }
  return total
}

/** What buying takes out of the portfolio in the purchase year: the down payment and the fees. */
export function purchaseWithdrawalCents(params: ProjectionParams): number {
  const down = Math.round(housePriceAtPurchaseCents(params) * params.downPaymentFraction)
  return down + params.transactionCostsCents
}

/** What plan year `year` adds and takes besides growth. The first year has no year behind it. */
export function yearFlows(params: ProjectionParams, year: number): YearFlows {
  if (year <= 0) return { contributionCents: 0, eventsCents: 0 }
  const buys = params.housePurchaseYear !== null && params.housePurchaseYear > 0 && year === params.housePurchaseYear
  return {
    contributionCents: annualContributionCents(params.monthlyContributionCents, params.contributionSteps ?? [], year, params.inflationRate),
    eventsCents: (buys ? -purchaseWithdrawalCents(params) : 0) + (params.lifeEvents ? lifeEventImpact(params.lifeEvents, year) : 0),
  }
}

/**
 * A year on. The year's saving lands at its end and earns nothing until the next year, a little
 * cautious against paying each month; that is the value before the events (`pre`), which the plan's
 * line rises to, and the events then land on the anniversary (`post`). Nothing is floored: a balance
 * can go negative.
 */
export function stepInvested(prev: number, growth: number, flows: YearFlows): { pre: number; post: number } {
  const pre = Math.round(prev * growth + flows.contributionCents)
  return { pre, post: pre + flows.eventsCents }
}
