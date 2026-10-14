import type { TxnType } from '../types'

export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface RecurringSuggestion {
  description: string
  type: TxnType
  accountId: number
  categoryId: number
  /** The amount of the newest charge in the series. */
  amountCents: number
  /** The date the charge is expected on. */
  predictedDate: string
  /** Where the charge belongs by this series' own booking habit; the month "+" files it under. */
  predictedBudgetMonth: string
  /** Days before `predictedDate` that the suggestion starts to show: a day's notice plus how early the series has recently landed. */
  leadDays: number
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
  /** Per-occurrence months from the date's calendar month to its budget month. */
  budgetOffsets: number[]
}
