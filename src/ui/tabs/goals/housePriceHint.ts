import { formatCentsCompact, formatPercent, housePriceAtPurchaseCents, type MoneyFormat } from '../../../engine'
import type { NewGoalScenario } from '../../../data/dataSource'
import { planMoneyLabel } from './planMoneyLabel'

/** The price the house will cost on the day it is bought, in the plan's euros, or null when there is no purchase to price. */
function priceAtPurchase(draft: NewGoalScenario, inflationRate: number): { year: number; real: number } | null {
  const year = draft.housePurchaseYear
  if (year === null || year <= 0 || draft.housePriceCents <= 0) return null
  return { year, real: housePriceAtPurchaseCents({ ...draft, inflationRate }) }
}

/**
 * Said under the house price: the price entered is the one at the plan's start (today's, for a plan with no start date),
 * and a house bought later has had time to rise from there, so what it costs on the day is said in the money of the plan
 * start, which the plan counts in. Nothing for a house not bought, or owned already (its price is what it is worth now),
 * or no price yet.
 */
export function housePriceHint(draft: NewGoalScenario, inflationRate: number, format: MoneyFormat): string | null {
  const bought = priceAtPurchase(draft, inflationRate)
  if (!bought) return null
  const money = (cents: number) => formatCentsCompact(cents, format)
  return `${draft.planStartDate ? "Enter the price at the plan's start." : "Enter today's price."} Bought in year ${bought.year} it costs about ${money(bought.real)} in ${planMoneyLabel(draft.planStartDate, format)}.`
}

/**
 * The same cost in euros as paid on the day, so the number a buyer will actually see is there too, and the rates it was
 * worked out from. For whoever opens the note, not for a first read.
 */
export function housePriceDetail(draft: NewGoalScenario, inflationRate: number, format: MoneyFormat): string | null {
  const bought = priceAtPurchase(draft, inflationRate)
  if (!bought) return null
  const paid = Math.round(bought.real * Math.pow(1 + inflationRate, bought.year))
  return `When you pay it that is about ${formatCentsCompact(paid, format)} on your account, as houses rise ${formatPercent(draft.houseAppreciationRate, format)} a year and inflation is ${formatPercent(inflationRate, format)}.`
}
