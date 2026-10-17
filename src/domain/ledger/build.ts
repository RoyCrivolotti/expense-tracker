import type { ExpenseDataset } from '../types'
import { sortedMonths } from '../engine/dates'
import { buildCells } from './cells'
import { DEFAULT_HYDRATION_POLICY, type HydrationPolicy, hydratedMonthsFor } from './hydration'
import { partitionPinned } from './pinned'
import type { Ledger } from './types'

/**
 * Splits a full dataset into a ledger that holds real rows for `hydratedMonths` and the pinned rows,
 * and one cell per group of the remaining rows. A pinned row is never summed, so it is not counted twice
 * when the cells and the rows are added up.
 */
export function buildLedger(dataset: ExpenseDataset, hydratedMonths: Iterable<string>): Ledger {
  const { transactions, ...reference } = dataset
  const hydrate = new Set(hydratedMonths)
  const { pinned, rest } = partitionPinned(transactions)
  const hydrated = transactions.filter((row) => hydrate.has(row.budgetMonth))
  const summed = rest.filter((row) => !hydrate.has(row.budgetMonth))
  return {
    reference,
    pinned,
    hydratedMonths: sortedMonths(hydrate),
    hydrated,
    cells: buildCells(summed),
  }
}

/**
 * The ledger a screen showing `viewed` would hold under `policy`: every month while the ledger is small,
 * the window of months with data ending at `viewed` once it is not.
 */
export function ledgerFor(
  dataset: ExpenseDataset,
  viewed: string,
  policy: HydrationPolicy = DEFAULT_HYDRATION_POLICY,
): Ledger {
  const dataMonths = dataset.transactions.map((row) => row.budgetMonth)
  return buildLedger(dataset, hydratedMonthsFor(dataMonths, dataset.transactions.length, viewed, policy))
}
