import type { TransactionSeed } from '../actions'
import { suggestBudgetMonth } from '../components/transactionFormState'
import type { ExpenseModel } from '../useExpenseData'
import type { TxnDateScope } from './txnDateScope'

/**
 * What the + on a day header seeds. On the budget month scope the list is the month on screen's rows by day, so a day
 * on the other side of the rollover (1 November under December) is there because its rows belong to that month, and a
 * row added from its header is meant to land there too, not where the date rule would file it. The other scopes mix
 * budget months, and the date rule decides, as the form does when the date is changed by hand.
 */
export function dayHeaderSeed(
  model: ExpenseModel,
  month: string,
  scope: TxnDateScope,
  date: string,
): TransactionSeed {
  return { date, budgetMonth: scope === 'budgetMonth' ? month : suggestBudgetMonth(model, date) }
}
