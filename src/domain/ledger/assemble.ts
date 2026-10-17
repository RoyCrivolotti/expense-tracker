import type { ExpenseDataset, Transaction } from '../types'
import { sortedMonths } from '../engine/dates'
import { cellRows } from './cells'
import type { Ledger, LedgerRows } from './types'

/** The order the API returns rows in: newest date first, then highest id. */
function byApiOrder(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  return b.id - a.id
}

/** Pinned and hydrated rows once each: a pinned row in a hydrated month is in both lists. */
function realRows(ledger: Ledger): Transaction[] {
  const byId = new Map<number, Transaction>()
  for (const row of ledger.pinned) byId.set(row.id, row)
  for (const row of ledger.hydrated) byId.set(row.id, row)
  return [...byId.values()].sort(byApiOrder)
}

/**
 * The row lists to hand the engines. A month that is hydrated is never also summed, even if the ledger
 * still holds cells for it, so a client that keeps every month's sums and hydrates one needs no cleanup.
 */
export function assembleRows(ledger: Ledger): LedgerRows {
  const real = realRows(ledger)
  const hydrated = new Set(ledger.hydratedMonths)
  const cells = ledger.cells.filter((cell) => !hydrated.has(cell.budgetMonth))
  const summed = cellRows(cells, ledger.reference.accounts, ledger.reference.accountStatements)
  return { real, linear: [...real, ...summed].sort(byApiOrder) }
}

/** The dataset with `transactions` replaced, for code that takes a whole dataset. */
export function ledgerDataset(ledger: Ledger, rows: Transaction[]): ExpenseDataset {
  return { ...ledger.reference, transactions: rows }
}

/** Budget months with at least one row, cancelled rows included: what the month picker steps through. */
export function ledgerMonths(ledger: Ledger): string[] {
  const months = new Set<string>()
  for (const row of ledger.pinned) months.add(row.budgetMonth)
  for (const row of ledger.hydrated) months.add(row.budgetMonth)
  for (const cell of ledger.cells) months.add(cell.budgetMonth)
  return sortedMonths(months)
}

/** How many rows the ledger stands for: real rows once each, plus every row summed into a cell. */
export function ledgerRowCount(ledger: Ledger): number {
  const hydrated = new Set(ledger.hydratedMonths)
  const summed = ledger.cells.reduce((n, cell) => (hydrated.has(cell.budgetMonth) ? n : n + cell.count), 0)
  return realRows(ledger).length + summed
}
