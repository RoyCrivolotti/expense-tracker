import { useMemo } from 'react'
import type { RecurringSuggestion } from '../../engine'
import { defaultBudgetMonth, detectUpcoming } from '../../engine'
import { todayLocalIso } from '../dates'
import { useStoppedSuggestions } from './stoppedSuggestions'
import type { ExpenseModel } from '../useExpenseData'

const NONE: RecurringSuggestion[] = []

export interface Upcoming {
  suggestions: RecurringSuggestion[]
  /** The day they were worked out for, which the rows are worded against. */
  today: string
}

/**
 * The charges due today that are not logged yet, for the Transactions tab showing `month`.
 *
 * They do not depend on the month: the same charges are due whichever one is open. They are for
 * now, though, so they are offered above the month today falls in and above the newest month with
 * data (the two differ for a few days around the rollover) and not above a month that is being
 * looked back at. A series the owner stopped on this device is left out.
 */
export function useUpcoming(model: ExpenseModel, month: string): Upcoming {
  const today = todayLocalIso()
  const { transactions, settings } = model.dataset
  const { stopped } = useStoppedSuggestions()
  const suggestions = useMemo(
    () => detectUpcoming(transactions, { today, stopped }),
    [transactions, today, stopped],
  )
  const currentMonth = defaultBudgetMonth(today, settings.budgetRolloverDay)
  const newestMonth = model.months[model.months.length - 1] ?? currentMonth
  const oldestShown = currentMonth < newestMonth ? currentMonth : newestMonth
  return { suggestions: month >= oldestShown ? suggestions : NONE, today }
}
