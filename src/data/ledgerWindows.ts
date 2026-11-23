/**
 * Which months of a held ledger to keep as rows: the whole ledger while it is small, otherwise the window around the
 * month on screen and the newest window.
 */
import type { ReferencePart } from '../domain/data/ledgerParts'
import { sortedMonths } from '../domain/engine/dates'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy, chooseHydratedMonths } from '../domain/ledger'
import type { HeldLedger } from './ledgerHold'

/**
 * The months to hold as rows for a screen showing `viewed`: the window around it, and the newest window,
 * which what reads the recent past (recent activity, the cash reserve, the pace) does not move away from.
 */
function windows(
  months: readonly string[],
  viewed: string,
  count: number,
): string[] {
  const newest = months[months.length - 1] ?? viewed
  return sortedMonths([...chooseHydratedMonths(months, viewed, count), ...chooseHydratedMonths(months, newest, count)])
}

/** Every month for a ledger held in full, otherwise the windows. */
export function wantedMonths(
  held: HeldLedger,
  viewed: string,
  count: number = HYDRATED_DATA_MONTHS,
): string[] {
  return held.cells === null ? held.months : windows(held.months, viewed, count)
}

/** The months to read as rows for a reference: every month while the ledger is small, otherwise the windows. */
export function monthsToHold(
  reference: ReferencePart,
  viewed: string,
  policy: HydrationPolicy,
): string[] {
  return reference.rowCount <= policy.fullBelowRows
    ? reference.months
    : windows(reference.months, viewed, policy.dataMonths)
}

export function missingMonths(
  held: HeldLedger,
  wanted: readonly string[],
): string[] {
  return wanted.filter((month) => !held.rows.has(month))
}
