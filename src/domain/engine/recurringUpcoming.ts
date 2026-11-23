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

/** A series the card reminds about: monthly and regular, with where in the month it lands. */
export interface MonthlySeries {
  group: OccurrenceGroup
  /** The dates of the series' charges, oldest first. */
  dates: string[]
  usual: UsualDay
  /** Days before a usual date that its reminder opens. */
  lead: number
}

/** The series as the card reads it, or null when its charges are not monthly or not regular enough to remind about. */
export function monthlySeriesOf(group: OccurrenceGroup): MonthlySeries | null {
  const dates = group.dates
  const gaps = dates.slice(1).map((date, i) => daysBetween(dates[i]!, date))
  if (classifyFrequency(median(gaps)) !== 'monthly') return null
  if (regularityScore(gaps) < MIN_REGULARITY) return null
  const usual = usualDay(dates)
  return { group, dates, usual, lead: leadFromHistory(dates, usual) }
}

/**
 * Whether a logged charge answers for the usual date `date`: one logged from the start of the date's reminder window
 * on, or up to `LOGGED_EARLY_WITHIN_DAYS` before it, so a charge logged ahead of time, or booked to another budget
 * month, counts as the one it was for. `dates` are the series' charges, oldest first.
 */
export function chargeLoggedFor(
  { dates, lead }: Pick<MonthlySeries, 'dates' | 'lead'>,
  date: string,
): boolean {
  const newest = dates[dates.length - 1]!
  return addDaysIso(date, -lead) <= newest || dates.some((d) => daysBetween(d, date) <= LOGGED_EARLY_WITHIN_DAYS)
}

/**
 * The usual dates a series is still waiting for a charge on: the first `EXPECTED_CHARGES` after its newest charge that
 * no logged charge answers for. Past those the series has stopped and waits for nothing.
 */
export function awaitedDates(series: Pick<MonthlySeries, 'dates' | 'usual' | 'lead'>): string[] {
  const newest = series.dates[series.dates.length - 1]!
  // Start a month early: a usual date a few days past the month's end belongs to the month before.
  let month = shiftBudgetMonth(newest.slice(0, 7), -1)
  const awaited: string[] = []
  while (awaited.length < EXPECTED_CHARGES) {
    const date = usualDate(month, series.usual)
    month = shiftBudgetMonth(month, 1)
    if (!chargeLoggedFor(series, date)) awaited.push(date)
  }
  return awaited
}

/**
 * The date of the charge a series is waiting for on `today`: the first of its awaited dates that is not more than a
 * week past, so a date long gone is given up on and the next one is looked at.
 */
function pendingDate(
  series: MonthlySeries,
  today: string,
): string | null {
  return awaitedDates(series).find((date) => daysBetween(date, today) <= OVERDUE_EXPIRY_DAYS) ?? null
}

/** Whether the owner stopped this series at a charge that is still its newest. */
export function isStopped(
  group: OccurrenceGroup,
  stopped: StoppedSeries,
): boolean {
  const stop = stopped[groupKeyString(group.key)]
  return stop !== undefined && group.dates[group.dates.length - 1]! <= stop.after
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
  if (isStopped(group, stopped)) return null
  const series = monthlySeriesOf(group)
  if (!series) return null
  // The budget month is the series' own habit (the date's month, or the next one), not a
  // property of the date, so a pay date that rolls into the next month is filed there.
  const offset = Math.round(median(group.budgetOffsets.slice(-PREDICT_HISTORY)))
  const predictedDate = pendingDate(series, today)
  if (!predictedDate || !isDueSoon(predictedDate, today, series.lead)) return null

  return {
    seriesKey: groupKeyString(group.key),
    lastChargeDate: series.dates[series.dates.length - 1]!,
    description: group.label,
    type: group.key.type,
    accountId: group.key.accountId,
    categoryId: group.categoryId,
    amountCents: group.amountCents,
    predictedDate,
    predictedBudgetMonth: shiftBudgetMonth(predictedDate.slice(0, 7), offset),
    leadDays: series.lead,
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
