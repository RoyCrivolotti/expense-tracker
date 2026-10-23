import { sortedMonths } from '../engine/dates'

/**
 * How many months with data, counted back from the viewed month and including it, hold real rows. The
 * same-days cut and the per-row readers reach 12 months back, and 12 is one short for the year-ago
 * baseline (see docs/ENGINE-HISTORY.md, "Where a bound changes the output").
 */
export const HYDRATED_DATA_MONTHS = 13

/**
 * A ledger of at most this many rows hydrates every month. Worker CPU is the first documented limit a larger
 * ledger would meet (docs/SCALING.md), so below this the extra code path buys nothing and the ledger behaves
 * exactly as the whole dataset does.
 */
export const FULL_HYDRATION_ROW_LIMIT = 5_000

export interface HydrationPolicy {
  /** At most this many rows hydrate every month. */
  fullBelowRows: number
  /** Past that, how many months with data hydrate. */
  dataMonths: number
}

export const DEFAULT_HYDRATION_POLICY: HydrationPolicy = {
  fullBelowRows: FULL_HYDRATION_ROW_LIMIT,
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
