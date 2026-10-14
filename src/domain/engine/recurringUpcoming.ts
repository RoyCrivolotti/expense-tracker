import type { Transaction } from '../types'
import { addDaysIso, daysBetween, isDueSoon, shiftBudgetMonth } from './dates'
import { groupTransactions } from './recurringDetect'
import {
  PREDICT_HISTORY,
  type UsualDay,
  classifyFrequency,
  leadFromHistory,
  median,
  regularityScore,
  usualDate,
  usualDay,
} from './recurringPredict'
import type { OccurrenceGroup, RecurringSuggestion } from './recurringTypes'

const MIN_REGULARITY = 0.6

/**
 * Days after its date that a charge nobody has logged stays on the card. Charges are logged within
 * a day or two, so one still missing after a week is more likely a series that stopped than an
 * entry that was forgotten, and a longer wait mostly shows cancelled subscriptions.
 */
export const OVERDUE_EXPIRY_DAYS = 7

/**
 * How many charges the card waits for. The first is the one due next; the second is there for a
 * series whose last charge was never logged, so that forgetting one entry does not silence the
 * reminder for the month after it. A series with two charges missing in a row has stopped.
 */
const EXPECTED_CHARGES = 2

/**
 * A charge booked to the same budget month as a usual date, and dated within this many days of
 * it, is the charge for that date even if it came earlier than the reminder window reaches: a
 * bill logged on the 3rd for the 10th. Further off, a row in the same month is as likely to be an
 * adjustment, or the previous cycle's charge booked to the month after it.
 */
const SAME_MONTH_WITHIN_DAYS = 20

interface LoggedCharge {
  date: string
  budgetMonth: string
}

/**
 * The date of the charge a series is waiting for: the first of its usual dates that no logged
 * charge covers. A charge covers a date when it was logged from the start of the date's reminder
 * window on, or when it is booked to the same budget month and dated close to it, so a charge
 * logged ahead of time, or booked to another budget month, counts as the one it was for. A date
 * more than a week past is given up on and the next one is looked at, up to `EXPECTED_CHARGES`.
 */
function pendingDate(
  logged: LoggedCharge[],
  usual: UsualDay,
  lead: number,
  budgetOffset: number,
  today: string,
): string | null {
  const newest = logged[logged.length - 1]!.date
  let month = shiftBudgetMonth(newest.slice(0, 7), -1)
  let waitedFor = 0
  while (waitedFor < EXPECTED_CHARGES) {
    const date = usualDate(month, usual)
    month = shiftBudgetMonth(month, 1)
    const budgetMonth = shiftBudgetMonth(date.slice(0, 7), budgetOffset)
    const covered =
      addDaysIso(date, -lead) <= newest ||
      logged.some(
        (charge) =>
          charge.budgetMonth === budgetMonth && Math.abs(daysBetween(charge.date, date)) <= SAME_MONTH_WITHIN_DAYS,
      )
    if (covered) continue
    waitedFor++
    if (daysBetween(date, today) <= OVERDUE_EXPIRY_DAYS) return date
  }
  return null
}

function suggestionFor(group: OccurrenceGroup, today: string): RecurringSuggestion | null {
  const dates = group.dates
  const gaps = dates.slice(1).map((date, i) => daysBetween(dates[i]!, date))
  if (classifyFrequency(median(gaps)) !== 'monthly') return null
  if (regularityScore(gaps) < MIN_REGULARITY) return null

  const usual = usualDay(dates)
  const lead = leadFromHistory(dates, usual)
  // The budget month is the series' own habit (the date's month, or the next one), not a
  // property of the date, so a pay date that rolls into the next month is filed there.
  const offset = Math.round(median(group.budgetOffsets.slice(-PREDICT_HISTORY)))
  const logged = dates.map((date, i) => ({
    date,
    budgetMonth: shiftBudgetMonth(date.slice(0, 7), group.budgetOffsets[i]!),
  }))
  const predictedDate = pendingDate(logged, usual, lead, offset, today)
  if (!predictedDate || !isDueSoon(predictedDate, today, lead)) return null

  return {
    description: group.label,
    type: group.key.type,
    accountId: group.key.accountId,
    categoryId: group.categoryId,
    amountCents: group.amountCents,
    predictedDate,
    predictedBudgetMonth: shiftBudgetMonth(predictedDate.slice(0, 7), offset),
    frequency: 'monthly',
    leadDays: lead,
  }
}

/**
 * The recurring monthly charges that are due on `today` and not yet logged: from a day or more
 * before their usual date until a week after it. It looks only at the dates of the series' own
 * charges, never at which budget month is on screen, so the same charge is on the card whichever
 * month is open.
 */
export function detectUpcoming(
  transactions: Transaction[],
  options: { today: string },
): RecurringSuggestion[] {
  const suggestions: RecurringSuggestion[] = []
  for (const group of groupTransactions(transactions)) {
    const suggestion = suggestionFor(group, options.today)
    if (suggestion) suggestions.push(suggestion)
  }
  return suggestions.sort(
    (a, b) => a.predictedDate.localeCompare(b.predictedDate) || a.description.localeCompare(b.description),
  )
}
