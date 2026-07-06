import type { TxnType } from '../types'

export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface RecurringSuggestion {
  description: string
  type: TxnType
  accountId: number
  categoryId: number
  amountCents: number
  predictedDate: string
  predictedBudgetMonth: string
  frequency: RecurringFrequency
  confidence: number
  occurrences: number
}

export interface GroupKey {
  normalizedDesc: string
  accountId: number
  categoryId: number
  type: TxnType
}

export interface OccurrenceGroup {
  key: GroupKey
  label: string
  categoryId: number
  amountCents: number
  dates: string[]
  budgetMonths: Set<string>
}

export interface DetectRecurringOptions {
  /**
   * Scope suggestions to this budget month (requires prior-month activity).
   * Monthly patterns predict on the canonical day within this budget month.
   */
  forBudgetMonth?: string
}
