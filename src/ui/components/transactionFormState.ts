import type { Transaction, TxnType } from '../../types'
import { resolveDefaultAccountId } from '../../data/defaultAccount'
import { defaultBudgetMonth } from '../../engine/dates'
import type { ExpenseModel } from '../useExpenseData'

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

/** Seed the form from an existing transaction, or sensible defaults for a new one. */
export function initialFields(editing: Transaction | null, model: ExpenseModel): FormFields {
  const { categories, accounts } = model.dataset
  if (editing) {
    return {
      type: editing.type,
      amount: String(editing.amountCents / 100),
      description: editing.description,
      categoryId: editing.categoryId,
      accountId: editing.accountId,
      date: editing.date,
      budgetMonth: editing.budgetMonth,
      notes: editing.notes ?? '',
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
