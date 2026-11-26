import { defaultBudgetMonth } from '../../domain/engine/dates'
import { todayIso } from '../components/transactionFormState'
import type { ExpenseModel } from '../useExpenseData'
import type { BulkEditFieldState } from './bulkEditFields'

/** Every field off, each starting from a sensible value for when it is switched on. */
export function initialBulkFields(model: ExpenseModel): BulkEditFieldState {
  return {
    categoryEnabled: false,
    categoryId: model.dataset.categories[0]?.id ?? 0,
    accountEnabled: false,
    accountId: model.dataset.accounts[0]?.id ?? 0,
    typeEnabled: false,
    type: 'expense',
    dateEnabled: false,
    date: todayIso(),
    budgetMonthEnabled: false,
    // Not the calendar month: an owner whose budget rolls over mid-month would be
    // handed a month a single edit would never produce.
    budgetMonth: defaultBudgetMonth(todayIso(), model.dataset.settings.budgetRolloverDay),
    flagEnabled: false,
    flagId: model.dataset.flags.find((f) => f.active)?.id ?? null,
    labelsEnabled: false,
    labelIds: [],
    descriptionEnabled: false,
    description: '',
  }
}
