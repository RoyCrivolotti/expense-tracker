import { projectNetWorth, purchaseYearBreakdown, type ProjectionParams } from './projection'

/**
 * The first year the invested portfolio is below zero, and what put it there. The projection does
 * not stop a purchase or a life event that costs more than the portfolio holds: the balance goes
 * negative and then compounds at the plan's return, a debt no lender offers, so every figure from
 * that year on describes a plan nobody could follow.
 */
export interface PortfolioShortfall {
  year: number
  /** How far below zero the portfolio ends that year. */
  belowZeroCents: number
  /** `house` when the down payment and the costs alone take it below zero, `event` otherwise. */
  cause: 'house' | 'event'
  /** The down payment and the costs when the cause is the house; 0 otherwise. */
  housePaymentCents: number
}

export function portfolioShortfall(params: ProjectionParams): PortfolioShortfall | null {
  const first = projectNetWorth(params).find((p) => p.year > 0 && p.investedCents < 0)
  if (!first) return null
  const bought = params.housePurchaseYear === first.year ? purchaseYearBreakdown(params, first.year) : null
  const houseIsShort = bought !== null && bought.beforePurchaseCents < bought.totalWithdrawalCents
  return {
    year: first.year,
    belowZeroCents: -first.investedCents,
    cause: houseIsShort ? 'house' : 'event',
    housePaymentCents: houseIsShort ? bought.totalWithdrawalCents : 0,
  }
}
