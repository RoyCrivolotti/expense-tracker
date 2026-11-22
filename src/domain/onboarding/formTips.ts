/**
 * When the advice lines in the transaction form show. They are not put away one by one: they follow what the account holds,
 * so they leave on their own once a person has saved a handful of payments.
 */

/** The lines about the Description and the budget month stay for a person's first ten payments. */
export const FIRST_PAYMENTS = 10

/** The line that says what is enough shows while the account has no payment, and only on the form for a new one. */
export function showFirstPaymentLine(
  transactionCount: number,
  editing: boolean,
): boolean {
  return !editing && transactionCount === 0
}

/** The line about reusing a name shows for a person's first payments, on a new one. */
export function showDescriptionLine(
  transactionCount: number,
  editing: boolean,
): boolean {
  return !editing && transactionCount < FIRST_PAYMENTS
}

/**
 * The line about the budget month shows when it differs from the month of the date (a person whose month starts mid-month, or
 * one who moved it by hand) for a person's first payments, on a new one: an edit keeps the month the payment has and is not
 * being asked to choose. `date` is `YYYY-MM-DD` and `budgetMonth` is `YYYY-MM`.
 */
export function showBudgetMonthLine(
  transactionCount: number,
  date: string,
  budgetMonth: string,
  editing: boolean,
): boolean {
  return !editing && transactionCount < FIRST_PAYMENTS && date.slice(0, 7) !== budgetMonth
}
