import { formatCentsCompact, formatPercent, housePriceAtPurchaseCents, type MoneyFormat } from '../../../engine'
import type { NewGoalScenario } from '../../../data/dataSource'
import { planMoneyLabel } from './planMoneyLabel'

/**
 * Said under the house price: the price entered is the one at the plan's start (today's, for a plan
 * with no start date), and a house bought later has had time to rise from there. It gives the cost on the purchase day twice, in the money of the plan start (what the
 * plan counts in) and in euros as paid, so the number a buyer will actually see is there too. Nothing
 * for a house not bought, or owned already (its price is what it is worth now), or no price yet.
 */
export function housePriceHint(draft: NewGoalScenario, inflationRate: number, format: MoneyFormat): string | null {
  const year = draft.housePurchaseYear
  if (year === null || year <= 0 || draft.housePriceCents <= 0) return null
  const real = housePriceAtPurchaseCents({ ...draft, inflationRate })
  const paid = Math.round(real * Math.pow(1 + inflationRate, year))
  const money = (cents: number) => formatCentsCompact(cents, format)
  return (
    `${draft.planStartDate ? "Enter the price at the plan's start." : "Enter today's price."} Bought in year ${year} it costs about ${money(real)} in ${planMoneyLabel(draft.planStartDate, format)} ` +
    `(${money(paid)} when you pay it), as houses rise ${formatPercent(draft.houseAppreciationRate, format)} a year ` +
    `and inflation is ${formatPercent(inflationRate, format)}.`
  )
}
