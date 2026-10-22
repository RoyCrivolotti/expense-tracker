import type { Transaction } from '../types'
import { addDaysIso, daysBetween, isDueSoon, shiftBudgetMonth } from './dates'
import { groupKeyString, groupTransactions, newestChargeBySeries } from './recurringDetect'
import {
  MIN_REGULARITY,
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

/**
 * Days after its date that a charge nobody has logged stays on the card. Charges are logged within
 * a day or two, so one still missing after a week is more likely a series that stopped than an
 * entry that was forgotten, and a longer wait mostly shows cancelled subscriptions.
 */
const OVERDUE_EXPIRY_DAYS = 7

/**
 * How many charges the card waits for. The first is the one due next; the second is there for a
 * series whose last charge was never logged, so that forgetting one entry does not silence the
 * reminder for the month after it. A series with two charges missing in a row has stopped.
 */
const EXPECTED_CHARGES = 2

/**
 * A charge logged up to this many days before a usual date is the charge for that date even if it
 * came earlier than the reminder window reaches: a bill logged on the 3rd for the 10th. Whichever
 * budget month it was booked to, because the label is the one thing a bill logged early, or an
 * edited date, is likely to get differently. It stops short of half a month: a row further back is
 * nearer the previous usual date, or an adjustment, and must not hide the next reminder.
 */
const LOGGED_EARLY_WITHIN_DAYS = 14

interface Series {
  /** The dates of the series' charges, oldest first. */
  dates: string[]
  usual: UsualDay
  /** Days before a usual date that its reminder opens. */
  lead: number
}

/**
 * The date of the charge a series is waiting for: the first of its usual dates that no logged
 * charge covers. A charge covers a date when it was logged from the start of the date's reminder
 * window on, or up to `LOGGED_EARLY_WITHIN_DAYS` before it, so a charge logged ahead of time, or
 * booked to another budget month, counts as the one it was for. A date more than a week past is
 * given up on and the next one is looked at, up to `EXPECTED_CHARGES`.
 */
function pendingDate({ dates, usual, lead }: Series, today: string): string | null {
  const newest = dates[dates.length - 1]!
  // Start a month early: a usual date a few days past the month's end belongs to the month before.
  let month = shiftBudgetMonth(newest.slice(0, 7), -1)
  let waitedFor = 0
  while (waitedFor < EXPECTED_CHARGES) {
    const date = usualDate(month, usual)
    month = shiftBudgetMonth(month, 1)
    const covered =
      addDaysIso(date, -lead) <= newest || dates.some((d) => daysBetween(d, date) <= LOGGED_EARLY_WITHIN_DAYS)
    if (covered) continue
    waitedFor++
    if (daysBetween(date, today) <= OVERDUE_EXPIRY_DAYS) return date
  }
  return null
}

const NO_STOPPED: StoppedSeries = {}

/** Series the owner has stopped, by series key: each stays out of the card until a charge after `after` is logged. */
export type StoppedSeries = Readonly<Record<string, { after: string }>>

/**
 * The stopped series that still keep their suggestions away: those with no charge after the one
 * they were stopped at. A series with a newer charge has come back by itself, so it is not stopped
 * any more, whatever the list still holds. A series with no charges left counts as stopped. `known` are
 * newest charges by series key from elsewhere (the server's series), and the newer of the two counts.
 */
export function stillStopped<T extends { after: string }>(
  transactions: Transaction[],
  stopped: Readonly<Record<string, T>>,
  known: ReadonlyMap<string, string> = new Map(),
): Record<string, T> {
  const newest = newestChargeBySeries(transactions)
  for (const [seriesKey, date] of known) {
    if (date > (newest.get(seriesKey) ?? '')) newest.set(seriesKey, date)
  }
  return Object.fromEntries(
    Object.entries(stopped).filter(([seriesKey, { after }]) => (newest.get(seriesKey) ?? after) <= after),
  )
}

function suggestionFor(
  group: OccurrenceGroup,
  today: string,
  stopped: StoppedSeries,
): RecurringSuggestion | null {
  const dates = group.dates
  const seriesKey = groupKeyString(group.key)
  const lastChargeDate = dates[dates.length - 1]!
  const stop = stopped[seriesKey]
  if (stop && lastChargeDate <= stop.after) return null
  const gaps = dates.slice(1).map((date, i) => daysBetween(dates[i]!, date))
  if (classifyFrequency(median(gaps)) !== 'monthly') return null
  if (regularityScore(gaps) < MIN_REGULARITY) return null

  const usual = usualDay(dates)
  const lead = leadFromHistory(dates, usual)
  // The budget month is the series' own habit (the date's month, or the next one), not a
  // property of the date, so a pay date that rolls into the next month is filed there.
  const offset = Math.round(median(group.budgetOffsets.slice(-PREDICT_HISTORY)))
  const predictedDate = pendingDate({ dates, usual, lead }, today)
  if (!predictedDate || !isDueSoon(predictedDate, today, lead)) return null

  return {
    seriesKey,
    lastChargeDate,
    description: group.label,
    type: group.key.type,
    accountId: group.key.accountId,
    categoryId: group.categoryId,
    amountCents: group.amountCents,
    predictedDate,
    predictedBudgetMonth: shiftBudgetMonth(predictedDate.slice(0, 7), offset),
    leadDays: lead,
  }
}

/**
 * The recurring monthly charges that are due on `today` and not yet logged: from a day or more
 * before their usual date until a week after it. It looks only at the dates of the series' own
 * charges, never at which budget month is on screen, so the same charge is on the card whichever
 * month is open. A series the owner has stopped is left out until a charge after the one it was
 * stopped at is logged.
 *
 * `groups` are the series, built from `transactions` when absent. A caller that holds only some of the
 * history passes the series of all of it, since a series needs three rows and its gaps run over every one.
 */
export function detectUpcoming(
  transactions: Transaction[],
  options: { today: string; stopped?: StoppedSeries; groups?: OccurrenceGroup[] },
): RecurringSuggestion[] {
  const stopped = options.stopped ?? NO_STOPPED
  const suggestions: RecurringSuggestion[] = []
  for (const group of options.groups ?? groupTransactions(transactions)) {
    const suggestion = suggestionFor(group, options.today, stopped)
    if (suggestion) suggestions.push(suggestion)
  }
  return suggestions.sort(
    (a, b) => a.predictedDate.localeCompare(b.predictedDate) || a.description.localeCompare(b.description),
  )
}
