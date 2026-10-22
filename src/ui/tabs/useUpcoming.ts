import { useMemo } from 'react'
import type { RecurringSuggestion, StoppedSeries } from '../../engine'
import { defaultBudgetMonth, detectUpcoming } from '../../engine'
import { todayLocalIso } from '../dates'
import { useStoppedSuggestions } from './stoppedSuggestions'
import { useHistoryWatch } from '../useHistoryWatch'
import type { ExpenseModel, FixedHistory } from '../useExpenseData'
import type { Transaction } from '../../types'

const NONE: RecurringSuggestion[] = []

/**
 * The charges due on `today`: from the series of the whole history when the model carries them (it holds only
 * some of the rows, and a series needs every row it is made of), otherwise from the rows.
 */
export function upcomingOf(
  transactions: Transaction[],
  history: FixedHistory | undefined,
  today: string,
  stopped: StoppedSeries,
): RecurringSuggestion[] {
  return detectUpcoming(transactions, { today, stopped, ...(history ? { groups: history.groups } : {}) })
}

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
  const { history } = model
  useHistoryWatch(model)
  const { stopped } = useStoppedSuggestions()
  const suggestions = useMemo(
    () => upcomingOf(transactions, history, today, stopped),
    [transactions, history, today, stopped],
  )
  const currentMonth = defaultBudgetMonth(today, settings.budgetRolloverDay)
  const newestMonth = model.months[model.months.length - 1] ?? currentMonth
  const oldestShown = currentMonth < newestMonth ? currentMonth : newestMonth
  // A model that holds only some of the rows has no series to go on until they arrive, and offers nothing.
  const waiting = model.sums !== undefined && history === undefined
  return { suggestions: month >= oldestShown && !waiting ? suggestions : NONE, today }
}
