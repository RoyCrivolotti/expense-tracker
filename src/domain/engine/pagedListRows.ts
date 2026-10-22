import type { Account, AccountStatement, Transaction } from '../types'
import type { CashRow } from './cashReconciliation'
import { buildStatementPayments, type StatementPaymentRow } from './statementPayments'
import { matchesStatementPayment, rowSortKey, type TransactionListRow } from './transactionListRows'
import type { TxnFilter } from './transactions'

/** The statement payments the filter lets through, newest first, whatever transactions the list is built from. */
export function filteredStatementPayments(
  statements: AccountStatement[],
  cashRows: CashRow[],
  accounts: Account[],
  settings: { defaultAccountId: number | null },
  filter: TxnFilter,
): StatementPaymentRow[] {
  return buildStatementPayments(statements, cashRows, accounts, settings.defaultAccountId)
    .filter((row) => matchesStatementPayment(row, filter))
    .sort((a, b) => rowSortKey(b).localeCompare(rowSortKey(a)))
}

/**
 * The rows of a list read in pages, in the order `buildTransactionListRows` gives them: the transactions
 * loaded so far, newest first, with the statement payments among them. `payments` are newest first, as
 * `filteredStatementPayments` returns them.
 *
 * A payment sorts after the transactions of the day it falls on. While another page may still hold some of
 * that day, it is left out: shown now, it would sit above rows that arrive after it. So until the list is
 * `complete`, only payments on days newer than the oldest transaction loaded are in, because the day at the
 * edge of what has been read is not whole yet. Once complete, the rest follow.
 */
export function pagedListRows(
  loaded: readonly Transaction[],
  payments: readonly StatementPaymentRow[],
  complete: boolean,
): TransactionListRow[] {
  const rows: TransactionListRow[] = []
  let next = 0
  for (const txn of loaded) {
    for (; next < payments.length && payments[next]!.date > txn.date; next += 1) rows.push(payments[next]!)
    rows.push({ kind: 'transaction', txn })
  }
  if (complete) rows.push(...payments.slice(next))
  return rows
}
