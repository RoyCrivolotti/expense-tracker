import { currencyWord, formatPercent } from '../../../../engine'
import type { RentVsBuyResult } from '../../../../engine'
import type { MoneyFormat } from '../../../../engine/money'

/**
 * What the chart says about itself, in two parts. The lead is what a reader needs on first sight and what stops a wrong
 * decision: the cash both sides start with, what each does with it, what the house is priced at, which euros the figures
 * are in, that selling costs are left out, and that who leads depends on the return and house growth and is not the plan's
 * net worth. The details are the rest of what it assumes, in words a person can check against their own situation, and sit
 * behind a disclosure.
 */
export function rentVsBuyCaptionParts({
  upfrontCents,
  feesCents,
  priceCents,
  startYear,
  moneyLabel,
  carryRate,
  realReturn,
  houseGrowth,
  paymentCents,
  ownCheaper,
  loanPaidOffYear,
  money,
  format,
}: {
  upfrontCents: number
  /** The part of the upfront cash the buyer spends at once and does not own afterwards. */
  feesCents: number
  priceCents: number
  startYear: number
  moneyLabel: string
  carryRate: number
  /** What savings grow at a year after inflation, and what the house gains a year after inflation. */
  realReturn: number
  houseGrowth: number
  /** The bank's monthly payment as it is on the account; nothing when there is no loan. */
  paymentCents: number
  ownCheaper: RentVsBuyResult['ownCheaper']
  loanPaidOffYear: RentVsBuyResult['loanPaidOffYear']
  money: (cents: number) => string
  format: MoneyFormat
}): { lead: string; details: string[] } {
  const priced =
    startYear > 0
      ? `Compared from year ${startYear}, at the ${money(priceCents)} the house will cost then`
      : `Priced as if bought today, at ${money(priceCents)}`
  const lead =
    `Both start with ${money(upfrontCents)} and spend the same each month: the renter invests the difference, the buyer owns the house. ` +
    `${priced}, in ${moneyLabel}, with selling costs left out. ` +
    "Who leads depends on the return and house growth; this is not the plan's net worth."
  const payment =
    paymentCents > 0
      ? `The loan costs ${money(paymentCents)} a month on the account and stays that, so in these ${currencyWord(format)} it shrinks each year.`
      : null
  const details = [
    'The renter invests the cash and whatever owning would cost above the rent; the buyer owns the house, owes the loan and invests whatever rent would cost above owning.',
    ...(feesCents > 0 ? [`The buyer spends the ${money(feesCents)} fees at once, so the buyer's line starts lower.`] : []),
    ...(payment ? [payment] : []),
    ...(loanPaidOffYear === null ? [] : [`The loan is paid off in year ${Math.ceil(loanPaidOffYear)} after you buy.`]),
    monthlyCostSentence(ownCheaper),
    `Savings grow at the plan's ${formatPercent(realReturn, format)} a year and the house gains ${formatPercent(houseGrowth, format)} a year, both after inflation: a different return or house growth can change who leads.`,
    `Assumes rent stays the same in real terms, upkeep, tax and insurance of ${formatPercent(carryRate, format)} of the house's value a year, and no costs of selling.`,
    'Rent that rises faster than prices favours buying; selling costs and renovation favour renting; mortgage interest relief and tax on investment gains depend on your country and are not counted.',
    "These are the two choices on their own, without your starting portfolio and contributions, so they will not match the plan's net worth.",
    'The plan only takes the down payment and fees from your portfolio, not the loan or upkeep, so while owning costs more a month than renting, a house adds more to its net worth than it does here.',
  ]
  return { lead, details }
}

/** The lead and the details as one text, for what reads the whole of it. */
export function rentVsBuyCaption(args: Parameters<typeof rentVsBuyCaptionParts>[0]): string {
  const { lead, details } = rentVsBuyCaptionParts(args)
  return [lead, ...details].join(' ')
}

/** What owning costs a month against renting, in the words of the marker on the chart. */
function monthlyCostSentence(ownCheaper: RentVsBuyResult['ownCheaper']): string {
  if (ownCheaper === null) return 'Owning costs at least as much a month as renting throughout.'
  return ownCheaper.stays
    ? `From year ${ownCheaper.fromYear} owning costs less a month than renting, for the rest of the chart.`
    : `Owning first costs less a month than renting in year ${ownCheaper.fromYear}, though not for the rest of the chart.`
}
