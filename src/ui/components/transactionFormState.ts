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

function defaultFields(model: ExpenseModel): FormFields {
  const { categories, accounts } = model.dataset
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

function applySeed(defaults: FormFields, seed: TransactionSeed): FormFields {
  return {
    ...defaults,
    ...(seed.type != null ? { type: seed.type } : {}),
    ...(seed.amountCents != null ? { amount: formatEuroInput(seed.amountCents) } : {}),
    ...(seed.description != null ? { description: seed.description } : {}),
    ...(seed.categoryId != null ? { categoryId: seed.categoryId } : {}),
    ...(seed.accountId != null ? { accountId: seed.accountId } : {}),
    ...(seed.date != null ? { date: seed.date } : {}),
    ...(seed.budgetMonth != null ? { budgetMonth: seed.budgetMonth } : {}),
    notes: '',
  }
}

/** Seed the form from an existing transaction, a recurring suggestion, or sensible defaults. */
export function initialFields(
  editing: Transaction | null,
  model: ExpenseModel,
  seed?: TransactionSeed,
): FormFields {
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
  const defaults = defaultFields(model)
  return seed ? applySeed(defaults, seed) : defaults
}
