import { countsAsOccurrence } from '../domain/engine/recurringDetect'
import type { Transaction } from '../domain/types'

/** What of a row the series are made of: who it is, when it was, how much and where it is booked. */
const FIELDS = ['description', 'accountId', 'categoryId', 'type', 'date', 'budgetMonth', 'amountCents'] as const

const SERIES_FIELDS: ReadonlySet<string> = new Set(FIELDS)

/** Whether an edit naming these fields could make a row a different one to a series, for a write to rows that are not held. */
export function reshapesSeries(patch: object): boolean {
  return Object.keys(patch).some((field) => SERIES_FIELDS.has(field))
}

/** Whether a row, edited from `was` to `now`, could be a different row to a series. */
function reshaped(was: Transaction, now: Transaction): boolean {
  if (!countsAsOccurrence(was) && !countsAsOccurrence(now)) return false
  return countsAsOccurrence(was) !== countsAsOccurrence(now) || FIELDS.some((field) => was[field] !== now[field])
}

/**
 * Whether a write could have changed a recurring series: a row that counts towards one was added or removed, or
 * edited in what a series is made of. A flag, a label, a note, a receipt or the paid state of a row cannot, and
 * neither can a row that never counts (cancelled, without a description, a plan's payment). The server works the
 * series out from every row, so a read costs about ten rows per transaction: it is made for a write that could
 * have changed them and not for one that could not.
 */
export function touchesSeries(before: readonly Transaction[], after: readonly Transaction[]): boolean {
  const was = new Map(before.map((row) => [row.id, row]))
  for (const row of after) {
    const old = was.get(row.id)
    was.delete(row.id)
    if (old === undefined ? countsAsOccurrence(row) : reshaped(old, row)) return true
  }
  return [...was.values()].some(countsAsOccurrence)
}
