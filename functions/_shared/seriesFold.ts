/**
 * Turns the rows `SERIES_SQL` returns into the owner's recurring series (`RecurringSeries`,
 * `src/domain/engine/recurringSeries.ts`, whose comment says what each field is for).
 *
 * The rows arrive ordered by description, then date, then id, so a series' rows come oldest first and
 * the last one is its newest. One description holds a handful of series at most (the same text on
 * another account, category or type is another series), so only the runs of one description are kept
 * at a time.
 */
import { MIN_OCCURRENCES } from '../../src/domain/engine/recurringDetect'
import { SERIES_TAIL_DATES, SERIES_TAIL_OFFSETS, type RecurringSeries } from '../../src/domain/engine/recurringSeries'
import type { SeriesTuple } from './seriesSql'

interface Run {
  rows: number
  dates: string[]
  /** `gaps[i]` is the days from `dates[i]` to `dates[i + 1]`. */
  gaps: number[]
  /** The day number of the newest date so far. */
  lastDay: number
  months: Set<string>
  /** The newest `SERIES_TAIL_OFFSETS` rows, which are the ones whose budget offsets a series keeps. */
  tail: SeriesTuple[]
}

const ascending = (a: number, b: number): number => a - b

const MS_PER_DAY = 86_400_000

const dayNumber = (date: string): number =>
  Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / MS_PER_DAY

const monthNumber = (yearMonth: string): number => Number(yearMonth.slice(0, 4)) * 12 + Number(yearMonth.slice(5, 7))

function add(run: Run, row: SeriesTuple): void {
  const date = row[4]
  const day = dayNumber(date)
  if (run.rows > 0) run.gaps.push(day - run.lastDay)
  run.lastDay = day
  run.dates.push(date)
  run.months.add(row[6])
  run.tail.push(row)
  if (run.tail.length > SERIES_TAIL_OFFSETS) run.tail.shift()
  run.rows += 1
}

function toSeries(run: Run): RecurringSeries {
  const [, accountId, categoryId, type, , , , label, amountCents] = run.tail[run.tail.length - 1]!
  const older = run.dates.length - SERIES_TAIL_DATES
  return {
    label,
    accountId,
    categoryId,
    type,
    amountCents,
    newestDates: run.dates.slice(-SERIES_TAIL_DATES),
    olderGaps: older > 0 ? run.gaps.slice(0, older).sort(ascending) : [],
    budgetMonths: [...run.months].sort(),
    budgetOffsets: run.tail.map((row) => monthNumber(row[6]) - monthNumber(row[4])).sort(ascending),
  }
}

interface Found {
  series: RecurringSeries
  date: string
  id: number
}

/** The API's order: the series whose newest row is newest first, ties by that row's id. */
const newestFirst = (a: Found, b: Found): number => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1)

export function foldSeries(rows: SeriesTuple[]): RecurringSeries[] {
  const found: Found[] = []
  let runs = new Map<string, Run>()
  let description: string | undefined
  const close = (): void => {
    for (const run of runs.values()) {
      if (run.rows < MIN_OCCURRENCES) continue
      const newest = run.tail[run.tail.length - 1]!
      found.push({ series: toSeries(run), date: newest[4], id: newest[5] })
    }
  }
  for (const row of rows) {
    if (row[0] !== description) {
      close()
      runs = new Map()
      description = row[0]
    }
    const key = `${row[1]}|${row[2]}|${row[3]}`
    let run = runs.get(key)
    if (run === undefined) {
      run = { rows: 0, dates: [], gaps: [], lastDay: 0, months: new Set(), tail: [] }
      runs.set(key, run)
    }
    add(run, row)
  }
  close()
  return found.sort(newestFirst).map((f) => f.series)
}
