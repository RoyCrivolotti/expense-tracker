import { sortedMonths } from '../engine/dates'

/**
 * How many months with data, counted back from the viewed month and including it, hold real rows. The
 * same-days cut and the per-row readers reach 12 months back, and 12 is one short for the year-ago
 * baseline (see docs/ENGINE-HISTORY.md, "Where a bound changes the output").
 */
export const HYDRATED_DATA_MONTHS = 13

/**
 * A ledger of at most this many rows is held in full: every month is real rows, and the screens behave exactly as
 * they do over the whole dataset. Above it the ledger is held as a window with sums for the rest. The browser's main
 * thread is what this protects: the longest block grows with the rows held, and a phone starts to lag in the
 * thousands (docs/SCALE-PROOF.md).
 */
export const HOLD_IN_FULL_ROWS = 10_000

export interface HydrationPolicy {
  /** At most this many rows hydrate every month. */
  fullBelowRows: number
  /** Past that, how many months with data hydrate. */
  dataMonths: number
}

export const DEFAULT_HYDRATION_POLICY: HydrationPolicy = {
  fullBelowRows: HOLD_IN_FULL_ROWS,
  dataMonths: HYDRATED_DATA_MONTHS,
}

/**
 * The newest `count` months with data up to and including `viewed`. Windows count months with data, not
 * calendar months, so across a gap in the data the window reaches further back in time. `viewed` need
 * not have data itself (a deep link can open an empty month): the months before it are used.
 */
export function chooseHydratedMonths(
  dataMonths: Iterable<string>,
  viewed: string,
  count: number = HYDRATED_DATA_MONTHS,
): string[] {
  const upToViewed = sortedMonths(dataMonths).filter((month) => month <= viewed)
  return count > 0 ? upToViewed.slice(-count) : []
}

/** Every month when the ledger is small, otherwise the window around `viewed`. */
export function hydratedMonthsFor(
  dataMonths: Iterable<string>,
  rowCount: number,
  viewed: string,
  policy: HydrationPolicy = DEFAULT_HYDRATION_POLICY,
): string[] {
  if (rowCount <= policy.fullBelowRows) return sortedMonths(dataMonths)
  return chooseHydratedMonths(dataMonths, viewed, policy.dataMonths)
}
