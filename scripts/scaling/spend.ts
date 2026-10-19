/**
 * A running total of the rows a measurement run has read and written, as D1 reports them statement by
 * statement. It stops the run when a cap is crossed, so a wrong estimate costs one statement and not the
 * day's budget. The day's totals are kept in a small file between invocations (see the command line), so
 * the per-day caps hold across separate runs.
 */
import { CAPS } from './budget'

export interface Meta {
  rows_read?: number
  rows_written?: number
  duration?: number
}

export interface SpendTotals {
  day: string
  read: number
  written: number
  statements: number
}

export interface SpendLimits {
  readPerDay: number
  writtenPerDay: number
  readTotal: number
  writtenTotal: number
}

export class BudgetExceeded extends Error {}

export const DEFAULT_LIMITS: SpendLimits = {
  readPerDay: CAPS.rowsReadPerDay,
  writtenPerDay: CAPS.rowsWrittenPerDay,
  readTotal: CAPS.rowsReadTotal,
  writtenTotal: CAPS.rowsWrittenTotal,
}

/** What earlier days of the same exercise already spent; the totals cap counts it, the daily caps do not. */
export interface Earlier {
  read: number
  written: number
}

/** Days kept in the spend file: today's totals are looked up by date, the rest add up to `Earlier`. */
export function earlierThan(days: readonly SpendTotals[], day: string): Earlier {
  const before = days.filter((d) => d.day !== day)
  return {
    read: before.reduce((sum, d) => sum + d.read, 0),
    written: before.reduce((sum, d) => sum + d.written, 0),
  }
}

/** UTC calendar day, which is when Cloudflare resets the Free plan's daily limits. */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function emptyTotals(day: string): SpendTotals {
  return { day, read: 0, written: 0, statements: 0 }
}

/** Today's totals from the stored days, or a fresh day: yesterday's do not count against today's caps. */
export function totalsFor(days: readonly SpendTotals[], day: string): SpendTotals {
  const today = days.find((d) => d.day === day)
  return today ? { ...today } : emptyTotals(day)
}

export class SpendLedger {
  readonly totals: SpendTotals

  constructor(
    totals: SpendTotals,
    private readonly earlier: Earlier = { read: 0, written: 0 },
    private readonly limits: SpendLimits = DEFAULT_LIMITS,
  ) {
    this.totals = { ...totals }
  }

  /** Add one statement's cost, then throw if that crossed a cap. Counted first: the rows are already spent. */
  record(meta: Meta | undefined): void {
    this.totals.statements += 1
    this.totals.read += meta?.rows_read ?? 0
    this.totals.written += meta?.rows_written ?? 0
    this.assertWithin()
  }

  /** Throws when the totals are over a cap, or when `plannedWritten` more rows would put them over. */
  assertWithin(plannedWritten = 0, plannedRead = 0): void {
    const written = this.totals.written + plannedWritten
    const read = this.totals.read + plannedRead
    const { limits, earlier } = this
    const over = (what: string, value: number, cap: number): never => {
      throw new BudgetExceeded(`${what} would be ${value}, over this exercise's cap of ${cap}`)
    }
    if (written > limits.writtenPerDay) over('rows written today', written, limits.writtenPerDay)
    if (read > limits.readPerDay) over('rows read today', read, limits.readPerDay)
    if (earlier.written + written > limits.writtenTotal) {
      over('rows written in total', earlier.written + written, limits.writtenTotal)
    }
    if (earlier.read + read > limits.readTotal) over('rows read in total', earlier.read + read, limits.readTotal)
  }
}

/**
 * The whole account's use today, read from Cloudflare's analytics or typed by the maintainer, against the
 * ceilings that keep most of the day for the production app. Throws when either is already past.
 */
export function assertAccountHasRoom(
  usage: { rowsRead: number; rowsWritten: number },
  plannedWritten: number,
): void {
  if (usage.rowsWritten + plannedWritten > CAPS.accountWrittenCeiling) {
    throw new BudgetExceeded(
      `the account has written ${usage.rowsWritten} rows today; ${plannedWritten} more would pass ${CAPS.accountWrittenCeiling}`,
    )
  }
  if (usage.rowsRead > CAPS.accountReadCeiling) {
    throw new BudgetExceeded(
      `the account has read ${usage.rowsRead} rows today, past ${CAPS.accountReadCeiling}`,
    )
  }
}
