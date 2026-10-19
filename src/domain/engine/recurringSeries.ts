/**
 * A recurring series reduced to what the detectors read, so a caller that does not hold every row of
 * it (the browser, with a few months loaded) can be handed the whole history's series and run the
 * detectors unchanged. `seriesFromTransactions` is the reference for what the server answers.
 *
 * Reading the detectors (`recurringDetect.ts`, `recurringPredict.ts`, `recurringUpcoming.ts`,
 * `fixedFlexible.ts`, `fixedCosts.ts`, `spendingPace.ts`) for what a series' rows are used for:
 *
 * - The median and the regularity run over every gap between consecutive dates, in any order.
 * - The usual day reads the newest `PREDICT_HISTORY` dates, the lead the newest `WINDOW_HISTORY`, and the
 *   pending date only the newest one (an older date covers a usual date only if the newest one does).
 * - The budget offset is the median of the newest `PREDICT_HISTORY` rows' offsets.
 * - `activeInMonth` asks whether the series has a row in the budget month, the one before or the one
 *   before that, for any month the screen shows, and the fixed cost list shows the newest budget month.
 *   So every distinct budget month is needed, not the newest few.
 * - The group speaks for its newest row: its description, amount, account, category and type.
 *
 * That is the newest dates, every gap, the budget months, three offsets and the newest row. Nothing
 * else about an older row is read.
 */
import type { Transaction, TxnType } from '../types'
import { addDaysIso, daysBetween } from './dates'
import { fixedRhythmFromGaps } from './fixedFlexible'
import { groupKeyString, groupTransactions, normalizeDesc } from './recurringDetect'
import { PREDICT_HISTORY, WINDOW_HISTORY } from './recurringPredict'
import type { OccurrenceGroup } from './recurringTypes'

/** Newest dates a series carries as dates; every older one is known only by the gap before it. */
export const SERIES_TAIL_DATES = Math.max(PREDICT_HISTORY, WINDOW_HISTORY)

/** Newest rows whose budget offset a series carries. */
export const SERIES_TAIL_OFFSETS = PREDICT_HISTORY

export interface RecurringSeries {
  /** The newest row's description as it was typed. The series' normalized text is `normalizeDesc(label)`. */
  label: string
  accountId: number
  categoryId: number
  type: TxnType
  /** The newest row's amount. */
  amountCents: number
  /** The newest `SERIES_TAIL_DATES` dates, oldest first. */
  newestDates: string[]
  /**
   * The days between consecutive dates before those, from the oldest date up to the first of
   * `newestDates`, in ascending order of size: the order they happened in is not part of the data
   * because nothing reads it. A series of up to `SERIES_TAIL_DATES` rows has none.
   */
  olderGaps: number[]
  /** Every distinct budget month a row of the series is booked to, ascending. */
  budgetMonths: string[]
  /** Months from the date to the budget month of the newest `SERIES_TAIL_OFFSETS` rows, ascending. */
  budgetOffsets: number[]
}

const ascending = (a: number, b: number): number => a - b

/** The API's order: newest first, ties by id. The first row of a series in this order is its newest. */
function newestFirst(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  return b.id - a.id
}

function toSeries(group: OccurrenceGroup): RecurringSeries {
  const { dates } = group
  const older = dates.length - Math.min(dates.length, SERIES_TAIL_DATES)
  const gaps = dates.slice(1).map((date, i) => daysBetween(dates[i]!, date))
  return {
    label: group.label,
    accountId: group.key.accountId,
    categoryId: group.key.categoryId,
    type: group.key.type,
    amountCents: group.amountCents,
    newestDates: dates.slice(older),
    olderGaps: gaps.slice(0, older).sort(ascending),
    budgetMonths: [...group.budgetMonths].sort(),
    budgetOffsets: group.budgetOffsets.slice(-SERIES_TAIL_OFFSETS).sort(ascending),
  }
}

/**
 * The series of `transactions`, newest series first (the order `groupTransactions` meets them in a
 * dataset served newest first, which is how ties in the fixed cost list break). A series is three or
 * more rows that are neither cancelled, blank, nor a plan's payment.
 */
export function seriesFromTransactions(transactions: Transaction[]): RecurringSeries[] {
  return groupTransactions([...transactions].sort(newestFirst)).map(toSeries)
}

/** Every gap between a series' consecutive dates. */
export function gapsOfSeries(series: RecurringSeries): number[] {
  const { newestDates } = series
  return [...series.olderGaps, ...newestDates.slice(1).map((date, i) => daysBetween(newestDates[i]!, date))]
}

/**
 * The group the detectors read for a series. Its dates before `newestDates` are placed by stepping back
 * through `olderGaps`, so they have the right gaps but not the day each one really fell on.
 */
export function occurrenceGroupFromSeries(series: RecurringSeries): OccurrenceGroup {
  const older: string[] = []
  let date = series.newestDates[0]!
  for (let i = series.olderGaps.length - 1; i >= 0; i -= 1) {
    date = addDaysIso(date, -series.olderGaps[i]!)
    older.push(date)
  }
  return {
    key: {
      normalizedDesc: normalizeDesc(series.label),
      accountId: series.accountId,
      categoryId: series.categoryId,
      type: series.type,
    },
    label: series.label,
    categoryId: series.categoryId,
    amountCents: series.amountCents,
    dates: [...older.reverse(), ...series.newestDates],
    budgetMonths: new Set(series.budgetMonths),
    budgetOffsets: [...series.budgetOffsets],
  }
}

/**
 * The recurring series the fixed or flexible split trusts, from the whole history's series: what
 * `recurringFixedGroups` returns over every row. Only the ones that pass are given their dates.
 */
export function recurringFixedGroupsFromSeries(series: RecurringSeries[]): OccurrenceGroup[] {
  return series.filter((s) => fixedRhythmFromGaps(gapsOfSeries(s)) !== null).map(occurrenceGroupFromSeries)
}

/** The date of each series' newest charge by `groupKeyString`, for `stillStopped`. */
export function newestChargesOfSeries(series: RecurringSeries[]): Map<string, string> {
  return new Map(
    series.map((s) => [
      groupKeyString({
        normalizedDesc: normalizeDesc(s.label),
        accountId: s.accountId,
        categoryId: s.categoryId,
        type: s.type,
      }),
      s.newestDates[s.newestDates.length - 1]!,
    ]),
  )
}
