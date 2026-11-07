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
import type {
  Account,
  AccountStatement,
  ExpenseDataset,
  StoredTransaction,
  Transaction,
  TxnStatus,
} from '../types'
import { defaultBudgetMonth } from './dates'

/** Is a deferred account's statement for `yearMonth` marked paid? */
export function isStatementPaid(
  statements: AccountStatement[],
  accountId: number,
  yearMonth: string,
): boolean {
  const found = statements.find((s) => s.accountId === accountId && s.yearMonth === yearMonth)
  return found ? found.paid : false
}

function monthAfter(yearMonth: string): string {
  const [year = 0, month = 1] = yearMonth.split('-').map(Number)
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
}

/**
 * Budget month to suggest for a new transaction dated `isoDate`. The date rule picks
 * the month; this moves one month on when that month is the open one and is already
 * settled: every card that spent in it has its statement paid, and the next month
 * already holds rows. Entering into a paid month would show a card row as posted, and
 * the owner has moved on, so the rollover day no longer decides.
 *
 * It never goes backwards, and a back-dated entry keeps its own month. A card with no
 * spending in the month is ignored, since it has no statement row to be paid.
 */
export function recommendedBudgetMonth(
  isoDate: string,
  todayIso: string,
  rolloverDay: number,
  dataset: Pick<ExpenseDataset, 'accounts' | 'transactions' | 'accountStatements'>,
): string {
  const month = defaultBudgetMonth(isoDate, rolloverDay)
  if (month !== defaultBudgetMonth(todayIso, rolloverDay)) return month

  const next = monthAfter(month)
  const deferredIds = new Set(dataset.accounts.filter((a) => a.settlement === 'deferred').map((a) => a.id))
  const cardsThisMonth = new Set<number>()
  let nextMonthHasRows = false
  for (const t of dataset.transactions) {
    if (t.cancelled) continue
    if (t.budgetMonth === next) nextMonthHasRows = true
    else if (t.budgetMonth === month && deferredIds.has(t.accountId)) cardsThisMonth.add(t.accountId)
  }
  if (!nextMonthHasRows || cardsThisMonth.size === 0) return month

  for (const accountId of cardsThisMonth) {
    if (!isStatementPaid(dataset.accountStatements, accountId, month)) return month
  }
  return next
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
