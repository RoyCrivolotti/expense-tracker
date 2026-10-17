/**
 * The ledger: what the browser holds when it does not hold every transaction. The engines in
 * `src/domain/engine/` are the reference for every number, so a ledger is only worth having if the
 * rows assembled from it give the same answers (see docs/ENGINE-HISTORY.md for which engines can run
 * on less than the whole history, and docs/SCALING.md for where this fits).
 */
import type { ExpenseDataset, Transaction, TxnType } from '../types'

/** Everything in a dataset except its transactions. Small and bounded, so always held in full. */
export type LedgerReference = Omit<ExpenseDataset, 'transactions'>

/**
 * The sum of every unpinned row that shares a budget month, account, category, type, cancelled flag and
 * sign of amount. Not a `Transaction`: it has no id, date, description or status, so it cannot end up in
 * `dataset.transactions` by accident. `cellRows` turns it into a row for the engines that only add
 * amounts, and status is derived then, from the account and the statements as they are now.
 *
 * Rows of opposite sign stay in separate cells because some engines read the sign (a negative
 * investment is a withdrawal). A cell is kept when its sum is zero or when every row in it is cancelled,
 * because a month exists as soon as it has any row.
 */
export interface MonthCell {
  budgetMonth: string
  accountId: number
  categoryId: number
  type: TxnType
  cancelled: boolean
  sign: -1 | 0 | 1
  amountCents: number
  /** How many rows were summed. */
  count: number
}

export interface Ledger {
  reference: LedgerReference
  /**
   * Rows that stay real in any month: they are read by exact date, sign or link. See `isPinned`. Cells
   * never contain them.
   */
  pinned: Transaction[]
  /** The budget months held as real rows, oldest first. */
  hydratedMonths: string[]
  /** Every row dated in a hydrated month, pinned or not. */
  hydrated: Transaction[]
  /** One cell per group of unpinned rows in a month that is not hydrated. */
  cells: MonthCell[]
}

/** The two lists the engines are handed. Both are ordered the way the API returns rows. */
export interface LedgerRows {
  /**
   * Pinned rows, hydrated rows and one row per cell. For engines that only add amounts, for the list of
   * months, and for the ones that read a trend of sums beside the rows of the viewed month (the spending
   * groups and their detail). A cell row has a negative id, an empty description and the first day of its
   * month.
   */
  linear: Transaction[]
  /**
   * Pinned and hydrated rows only. For engines that read dates, descriptions, labels, links or whole
   * series, and for lists shown to the user, which must not contain a row that is not a transaction.
   */
  real: Transaction[]
}
