import { planMoneyLabel } from './planMoneyLabel'
import { yearLabel } from './yearLabel'

/**
 * What an amount of the plan's money comes to on the account `years` into the plan. The plan counts in
 * the euros of its start, and a euro on the account in a later year is worth less by the inflation.
 */
export function onAccountCents(realCents: number, years: number, inflationRate: number): number {
  return Math.round(realCents * Math.pow(1 + inflationRate, years))
}

/** Where on the account an amount is read, "on your account in 2056", or "in year 30" with no start date. */
export function onAccountLabel(years: number, planStartDate: string | null | undefined): string {
  return `on your account in ${yearLabel(years, planStartDate)}`
}

export interface BothMoneys {
  /** The amount in the plan's euros, formatted. */
  plan: string
  /** The same amount on the account at that point of the plan, formatted. */
  account: string
  planLabel: string
  accountLabel: string
  /** The two read the same, with no inflation or no time between, so they are not said twice. */
  same: boolean
}

/**
 * One amount of the plan's money in both the ways a person meets it: in the plan's euros, which is how the
 * plan is counted, and on the account at the point of the plan it is read at, which is what the screen will
 * show then.
 */
export function bothMoneys({
  cents,
  years,
  planStartDate,
  inflationRate,
  money,
}: {
  cents: number
  years: number
  planStartDate: string | null | undefined
  inflationRate: number
  money: (cents: number) => string
}): BothMoneys {
  const plan = money(cents)
  const account = money(onAccountCents(cents, years, inflationRate))
  return {
    plan,
    account,
    planLabel: planMoneyLabel(planStartDate),
    accountLabel: onAccountLabel(years, planStartDate),
    same: plan === account,
  }
}

/** The account half alone, for where there is room for little: "36.570 € on your account in 2036". */
export function onAccountPhrase(b: BothMoneys): string {
  return b.same ? `the same ${b.accountLabel}` : `${b.account} ${b.accountLabel}`
}

/** The account half as it reads after a plan-euros figure: "about 36.570 € on your account in 2036". */
export function aboutOnAccount(b: BothMoneys): string {
  return b.same ? onAccountPhrase(b) : `about ${onAccountPhrase(b)}`
}

/** What follows an amount already written out: "in 2026 euros, about 36.570 € on your account in 2036". */
export function bothMoneysTail(b: BothMoneys): string {
  return `in ${b.planLabel}, ${aboutOnAccount(b)}`
}

/** "30.000 € in 2026 euros, about 36.570 € on your account in 2036". */
export function bothMoneysSentence(b: BothMoneys): string {
  return `${b.plan} ${bothMoneysTail(b)}`
}
