import { formatPercent } from '../../../../engine'
import type { MoneyFormat } from '../../../../engine/money'

/**
 * What the chart assumes, in words a person can check against their own situation: the cash both
 * sides start with, what each does with it, where the comparison starts, which money the figures are
 * in, and what is held constant or left out.
 */
export function rentVsBuyCaption({
  upfrontCents,
  priceCents,
  startYear,
  moneyLabel,
  carryRate,
  paymentCents,
  money,
  format,
}: {
  upfrontCents: number
  priceCents: number
  startYear: number
  moneyLabel: string
  carryRate: number
  /** The bank's monthly payment as it is on the account; nothing when there is no loan. */
  paymentCents: number
  money: (cents: number) => string
  format: MoneyFormat
}): string {
  const start =
    startYear > 0
      ? `Compared from year ${startYear} of the plan, when it buys, at the ${money(priceCents)} the house will cost then.`
      : `Compared as if you bought today, at ${money(priceCents)}.`
  const payment =
    paymentCents > 0
      ? `The loan costs ${money(paymentCents)} a month on the account and stays that, so in these euros it shrinks each year.`
      : null
  return [
    `Both start with ${money(upfrontCents)} in cash (the down payment and fees) and spend the same in total on housing and investing every month.`,
    'The renter invests the cash and whatever owning would cost above the rent; the buyer owns the house, owes the loan and invests whatever rent would cost above owning.',
    start,
    `In ${moneyLabel}.`,
    ...(payment ? [payment] : []),
    `Assumes rent stays the same in real terms, upkeep, tax and insurance of ${formatPercent(carryRate, format)} of the house's value a year, and no costs of selling.`,
    "These are the two choices on their own, without your starting portfolio and contributions, so they will not match the plan's net worth.",
  ].join(' ')
}
