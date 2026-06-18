/**
 * Status derivation — the single source of truth for whether a transaction is
 * posted, forecast, or cancelled. There is no manual per-row toggle: status is
 * computed from the account's settlement type and the statement's paid flag.
 *
 *   cancelled              -> cancelled
 *   immediate settlement   -> posted (debit: cash leaves on entry)
 *   deferred + paid month  -> posted (card statement settled)
 *   deferred + unpaid month-> forecast (charge committed, not yet settled)
 */
import type { Account, AccountStatement, StoredTransaction, Transaction, TxnStatus } from '../types'

/** Is a deferred account's statement for `yearMonth` marked paid? */
export function isStatementPaid(
  statements: AccountStatement[],
  accountId: number,
  yearMonth: string,
): boolean {
  const found = statements.find((s) => s.accountId === accountId && s.yearMonth === yearMonth)
  return found ? found.paid : false
}

/** Derive the effective status for a single stored transaction. */
export function deriveStatus(
  txn: StoredTransaction,
  account: Account,
  statements: AccountStatement[],
): TxnStatus {
  if (txn.cancelled) return 'cancelled'
  if (account.settlement === 'immediate') return 'posted'
  return isStatementPaid(statements, txn.accountId, txn.budgetMonth) ? 'posted' : 'forecast'
}

/** Attach derived status to every stored transaction. */
export function deriveTransactions(
  stored: StoredTransaction[],
  accounts: Account[],
  statements: AccountStatement[],
): Transaction[] {
  const accountById = new Map(accounts.map((a) => [a.id, a]))
  return stored.map((txn) => {
    const account = accountById.get(txn.accountId)
    const status: TxnStatus = account ? deriveStatus(txn, account, statements) : 'posted'
    return { ...txn, status }
  })
}
