import type { Account, AccountStatement, StoredTransaction, Transaction } from '../types'
import { deriveTransactions } from '../engine/status'
import type { MonthCell } from './types'

function signOf(amountCents: number): -1 | 0 | 1 {
  return amountCents > 0 ? 1 : amountCents < 0 ? -1 : 0
}

type CellFields = Pick<MonthCell, 'budgetMonth' | 'accountId' | 'categoryId' | 'type' | 'cancelled' | 'sign'>

function cellKey(c: CellFields): string {
  return [c.budgetMonth, c.accountId, c.categoryId, c.type, c.cancelled, c.sign].join('|')
}

/** Month first, so the list reads in calendar order and two builds of the same rows are equal. */
function compareCells(a: MonthCell, b: MonthCell): number {
  if (a.budgetMonth !== b.budgetMonth) return a.budgetMonth < b.budgetMonth ? -1 : 1
  return (
    a.accountId - b.accountId ||
    a.categoryId - b.categoryId ||
    (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) ||
    Number(a.cancelled) - Number(b.cancelled) ||
    a.sign - b.sign
  )
}

/**
 * Sums rows into cells. The caller leaves out the rows that must stay real (pinned rows, and rows in
 * hydrated months): a row summed here is no longer a row.
 */
export function buildCells(rows: readonly StoredTransaction[]): MonthCell[] {
  const cells = new Map<string, MonthCell>()
  for (const row of rows) {
    const sign = signOf(row.amountCents)
    const key = cellKey({ ...row, sign })
    const cell = cells.get(key)
    if (cell) {
      cell.amountCents += row.amountCents
      cell.count += 1
    } else {
      cells.set(key, {
        budgetMonth: row.budgetMonth,
        accountId: row.accountId,
        categoryId: row.categoryId,
        type: row.type,
        cancelled: row.cancelled,
        sign,
        amountCents: row.amountCents,
        count: 1,
      })
    }
  }
  return [...cells.values()].sort(compareCells)
}

/**
 * One row per cell, for the engines that only add amounts. Ids are negative and unique within the list
 * (real ids are positive), the description is empty and the date is the first of the month. Status is
 * derived here from the account and the statements as they stand, so a cell on a card follows the
 * statement being toggled, and a cell of cancelled rows stays cancelled.
 */
export function cellRows(
  cells: readonly MonthCell[],
  accounts: Account[],
  statements: AccountStatement[],
): Transaction[] {
  const stored: StoredTransaction[] = cells.map((cell, i) => ({
    id: -(i + 1),
    date: `${cell.budgetMonth}-01`,
    budgetMonth: cell.budgetMonth,
    description: '',
    accountId: cell.accountId,
    categoryId: cell.categoryId,
    type: cell.type,
    amountCents: cell.amountCents,
    cancelled: cell.cancelled,
  }))
  return deriveTransactions(stored, accounts, statements).map((row) => ({ ...row, labelIds: [] }))
}

/** True for a row made by `cellRows`. Real rows have positive ids. */
export function isCellRow(row: Pick<Transaction, 'id'>): boolean {
  return row.id < 0
}
