import type { StatementPaymentRow } from '../../engine'
import type { ExpenseModel } from '../useExpenseData'

/** "1 item", "0 items", "2 items", for the cards that count what they hold. */
export function itemCountLabel(count: number): string {
  return `${count} item${count === 1 ? '' : 's'}`
}

/** The tapped row is a snapshot, so a date edit made in the sheet would never reach it.
 * The statement itself is current, and a filter cannot hide it while the sheet is open. */
export function livePaidOn(
  model: ExpenseModel,
  row: StatementPaymentRow,
): string {
  const statement = model.dataset.accountStatements.find(
    (s) => s.accountId === row.cardAccountId && s.yearMonth === row.budgetMonth,
  )
  return statement?.paidOn ?? row.date
}
