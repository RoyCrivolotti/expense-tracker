import type { NewGoalScenario } from '../../../data/dataSource'
import { formatCentsCompact, housePriceAtPurchaseCents, type MoneyFormat } from '../../../engine'
import { aboutOnAccount, bothMoneys } from './bothMoneys'
import { planMoneyLabel } from './planMoneyLabel'
import { ADJUST_LABELS } from './adjustSections'

export function purchaseSummary(
  draft: NewGoalScenario,
  inflationRate: number,
  format: MoneyFormat,
): string | null {
  const purchaseYear = draft.housePurchaseYear
  if (purchaseYear === null) return null
  const down = Math.round(housePriceAtPurchaseCents({ ...draft, inflationRate }) * draft.downPaymentFraction)
  const fees = draft.transactionCostsCents
  // Already owned, the house is yours from the start: nothing is taken out of the portfolio later, so
  // the starting balance is read as what is left after the down payment and fees. Without this, moving
  // the year from Never to Already own adds the whole house to the net worth and nothing says why.
  const money = (cents: number) => formatCentsCompact(cents, format)
  const label = planMoneyLabel(draft.planStartDate, format)
  // The plan charges the portfolio for the down payment and the fees only: the loan and the upkeep are paid out
  // of the income the monthly investing is what is left of, so the person is told where to say otherwise.
  const rest = ` The loan and upkeep come from your income instead: if that lowers what you invest, add a change under ${ADJUST_LABELS.changes.title}.`
  if (purchaseYear === 0) {
    return `Already own: the starting balance is counted as what is left after the ${money(down)} down payment and ${money(fees)} fees (in ${label}), so nothing comes out of the portfolio later.${rest}`
  }
  const total = down + fees
  // The three are in the plan's euros; the account pays more in the year it is paid, which is the figure a buyer sees.
  const paid = bothMoneys({
    cents: total,
    years: purchaseYear,
    planStartDate: draft.planStartDate,
    inflationRate,
    money,
    format,
  })
  const account = paid.same ? '' : ` (${aboutOnAccount(paid)})`
  return `Year ${purchaseYear} takes ${money(total)} from the portfolio: ${money(down)} down + ${money(fees)} fees, in ${label}${account}.${rest}`
}
