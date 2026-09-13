import type { Transaction, TxnType } from '../../types'
import { resolveDefaultAccountId } from '../../data/defaultAccount'
import { defaultBudgetMonth } from '../../engine/dates'
import { formatMoneyInput, type MoneyFormat } from '../../engine/money'
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
  /** null = no flag. Kept out of the string-y fields since it is an id. */
  flagId: number | null
}

export type Setter = <K extends keyof FormFields>(key: K, value: FormFields[K]) => void

/** Today's date in the user's local calendar (not UTC — `toISOString` can read
 * as yesterday for part of the day in a positive-UTC-offset timezone). */
export function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function defaultFields(model: ExpenseModel): FormFields {
  const { categories, accounts } = model.dataset
  const today = todayIso()
  return {
    type: 'expense',
    amount: '',
    description: '',
    // Prefer an active category so a brand-new transaction never opens already
    // pointed at an archived one; fall back to any category if none are active.
    categoryId: categories.find((c) => c.active)?.id ?? categories[0]?.id ?? 0,
    accountId: resolveDefaultAccountId(accounts, model.dataset.settings),
    date: today,
    budgetMonth: defaultBudgetMonth(today, model.dataset.settings.budgetRolloverDay),
    notes: '',
    flagId: null,
  }
}

function applySeed(defaults: FormFields, seed: TransactionSeed, format: MoneyFormat): FormFields {
  return {
    ...defaults,
    ...(seed.type != null ? { type: seed.type } : {}),
    ...(seed.amountCents != null ? { amount: formatMoneyInput(seed.amountCents, format) } : {}),
    ...(seed.description != null ? { description: seed.description } : {}),
    ...(seed.categoryId != null ? { categoryId: seed.categoryId } : {}),
    ...(seed.accountId != null ? { accountId: seed.accountId } : {}),
    ...(seed.date != null ? { date: seed.date } : {}),
    ...(seed.budgetMonth != null ? { budgetMonth: seed.budgetMonth } : {}),
    notes: '',
    flagId: null,
  }
}

/** Seed the form from an existing transaction, a recurring suggestion, or sensible defaults. */
export function initialFields(
  editing: Transaction | null,
  model: ExpenseModel,
  format: MoneyFormat,
  seed?: TransactionSeed,
): FormFields {
  if (editing) {
    return {
      type: editing.type,
      amount: formatMoneyInput(editing.amountCents, format),
      description: editing.description,
      categoryId: editing.categoryId,
      accountId: editing.accountId,
      date: editing.date,
      budgetMonth: editing.budgetMonth,
      notes: editing.notes ?? '',
      flagId: editing.flagId ?? null,
    }
  }
  const defaults = defaultFields(model)
  return seed ? applySeed(defaults, seed, format) : defaults
}
