import { currencyWord, type MoneyFormat } from '../../../engine/money'

/**
 * What the plan's money is called: the money of the year the plan starts ("2026 euros", "2026 US dollars",
 * after the currency the owner tracks in). A figure in it is worth what that many were worth then, which is
 * what the plan counts in until it is re-baselined. A plan with no start date has no year to name, so it is
 * today's.
 */
export function planMoneyLabel(planStartDate: string | null | undefined, format: MoneyFormat): string {
  const year = planStartDate?.slice(0, 4)
  const word = currencyWord(format)
  return year && /^\d{4}$/.test(year) ? `${year} ${word}` : `today's ${word}`
}

/** What a chart's money is, in a few words: the plan's, or what the account will read in each year (Nominal). */
export function chartMoneyLabel(planStartDate: string | null | undefined, nominal: boolean, format: MoneyFormat): string {
  return nominal ? `in ${currencyWord(format)} on your account in each year` : `in ${planMoneyLabel(planStartDate, format)}`
}
