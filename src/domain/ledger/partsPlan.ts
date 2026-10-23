import { MAX_CUBE_MONTHS, MAX_ROWS_MONTHS, MAX_ROWS_PER_REQUEST, type MonthRange } from '../data/ledgerParts'
import { PartTooLargeError } from '../data/ledgerPartsErrors'
import { monthsBetweenBudget, shiftBudgetMonth, sortedMonths } from '../engine/dates'

const calendarSpan = (from: string, to: string): number => monthsBetweenBudget(from, to) + 1

/**
 * The rows requests that cover `months`, given how many rows each month with data holds. A request is a
 * calendar range, so it also returns the rows of any month with data inside it; those count against the
 * bound and come back as real rows, which is why the ledger assembled from them takes the months from the
 * ranges and not from the months asked for. Requests are as large as the bounds allow, so the common
 * case is one.
 */
export function planRowRanges(months: Iterable<string>, rowsPerMonth: Readonly<Record<string, number>>): MonthRange[] {
  const wanted = sortedMonths(months)
  const withData = Object.keys(rowsPerMonth).sort()
  const rowsIn = (from: string, to: string): number =>
    withData.reduce((sum, month) => (month >= from && month <= to ? sum + (rowsPerMonth[month] ?? 0) : sum), 0)
  const ranges: MonthRange[] = []
  let current: MonthRange | null = null
  for (const month of wanted) {
    if (current && fits(current.from, month, rowsIn)) {
      current.to = month
      continue
    }
    if (current) ranges.push(current)
    if (rowsIn(month, month) > MAX_ROWS_PER_REQUEST) {
      throw new PartTooLargeError(`${month} holds more than ${MAX_ROWS_PER_REQUEST} rows, more than one request returns`)
    }
    current = { from: month, to: month }
  }
  if (current) ranges.push(current)
  return ranges
}

function fits(from: string, to: string, rowsIn: (from: string, to: string) => number): boolean {
  return calendarSpan(from, to) <= MAX_ROWS_MONTHS && rowsIn(from, to) <= MAX_ROWS_PER_REQUEST
}

/** The cube requests that cover every month with data, in chunks of the longest range the route serves. */
export function planCubeRanges(months: Iterable<string>): MonthRange[] {
  const sorted = sortedMonths(months)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (first === undefined || last === undefined) return []
  const ranges: MonthRange[] = []
  for (let from = first; from <= last; from = shiftBudgetMonth(from, MAX_CUBE_MONTHS)) {
    const end = shiftBudgetMonth(from, MAX_CUBE_MONTHS - 1)
    ranges.push({ from, to: end < last ? end : last })
  }
  return ranges
}

/**
 * The cube requests for the months in `months` that are not in `covered`, which are the months a rows request reads: the
 * sums of a month held as rows are never used, since its rows are the truth. A request is a calendar range, so a covered
 * month between two others splits what is asked for into two requests, and a run of months without one is a single
 * request, or more at the longest range the route serves.
 */
export function planCubeRangesOutside(months: Iterable<string>, covered: ReadonlySet<string>): MonthRange[] {
  const ranges: MonthRange[] = []
  let run: string[] = []
  const flush = (): void => {
    ranges.push(...planCubeRanges(run))
    run = []
  }
  for (const month of sortedMonths(months)) {
    if (covered.has(month)) flush()
    else run.push(month)
  }
  flush()
  return ranges
}

/** Halves a range, or returns null when it is a single month and cannot be split. */
export function splitRange(range: MonthRange): [MonthRange, MonthRange] | null {
  const span = calendarSpan(range.from, range.to)
  if (span < 2) return null
  const middle = shiftBudgetMonth(range.from, Math.floor(span / 2) - 1)
  return [
    { from: range.from, to: middle },
    { from: shiftBudgetMonth(middle, 1), to: range.to },
  ]
}
