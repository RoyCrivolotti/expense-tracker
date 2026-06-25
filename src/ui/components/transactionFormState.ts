import type { Transaction, TxnType } from '../../types'
import { resolveDefaultAccountId } from '../../data/defaultAccount'
import { defaultBudgetMonth } from '../../engine/dates'
import { formatEuroInput } from '../../engine/money'
import type { ExpenseModel } from '../useExpenseData'
import type { TransactionSeed } from '../actions'

export interface FormFields {
  type: TxnType
  amount: string
  description: string
  categoryId: number
  accountId: number
  date: string
  budgetMonth: string
  notes: string
}

export type Setter = <K extends keyof FormFields>(key: K, value: FormFields[K]) => void

const todayIso = () => new Date().toISOString().slice(0, 10)

/** Seed the form from an existing transaction, a recurring suggestion, or sensible defaults. */
export function initialFields(
  editing: Transaction | null,
  model: ExpenseModel,
  seed?: TransactionSeed,
): FormFields {
  const { categories, accounts } = model.dataset
  if (editing) {
    return {
      type: editing.type,
      amount: formatEuroInput(editing.amountCents),
      description: editing.description,
      categoryId: editing.categoryId,
      accountId: editing.accountId,
      date: editing.date,
      budgetMonth: editing.budgetMonth,
      notes: editing.notes ?? '',
    }
  }
  if (seed) {
    return {
      type: seed.type,
      amount: formatEuroInput(seed.amountCents),
      description: seed.description,
      categoryId: seed.categoryId,
      accountId: seed.accountId,
      date: seed.date,
      budgetMonth: seed.budgetMonth,
      notes: '',
    }
  }
  const today = todayIso()
  return {
    type: 'expense',
    amount: '',
    description: '',
    categoryId: categories[0]?.id ?? 0,
    accountId: resolveDefaultAccountId(accounts, model.dataset.settings),
    date: today,
    budgetMonth: defaultBudgetMonth(today),
    notes: '',
  }
}
