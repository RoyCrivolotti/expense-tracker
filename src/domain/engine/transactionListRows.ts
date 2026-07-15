import type { Account, AccountStatement, Transaction } from '../types'
import type { CashRow } from './cashReconciliation'
import { buildStatementPayments, type StatementPaymentRow } from './statementPayments'
import { filterTransactions, type TxnFilter } from './transactions'

export type TransactionListRow =
  | { kind: 'transaction'; txn: Transaction }
  | StatementPaymentRow

function matchesPeriod(row: StatementPaymentRow, filter: TxnFilter): boolean {
  if (filter.dateFrom || filter.dateTo) {
    if (filter.dateFrom && row.date < filter.dateFrom) return false
    if (filter.dateTo && row.date > filter.dateTo) return false
    return true
  }
  if (filter.month) {
    if (row.budgetMonth === filter.month) return true
    return row.date.startsWith(`${filter.month}-`)
  }
  return true
}

function matchesQuery(row: StatementPaymentRow, query: string): boolean {
  const haystack = `${row.cardName} statement payment`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}

function matchesAccount(row: StatementPaymentRow, filter: TxnFilter): boolean {
  return filter.accountId == null || row.debitAccountId === filter.accountId
}

function matchesType(filter: TxnFilter): boolean {
  return !filter.type || filter.type === 'all' || filter.type === 'expense'
}

function matchesCategoryAndStatus(filter: TxnFilter): boolean {
  if (filter.categoryId != null) return false
  return !filter.status || filter.status === 'all' || filter.status === 'posted'
}

function matchesStatementPayment(row: StatementPaymentRow, filter: TxnFilter): boolean {
  if (!matchesPeriod(row, filter)) return false
  if (!matchesAccount(row, filter)) return false
  if (!matchesType(filter)) return false
  if (!matchesCategoryAndStatus(filter)) return false
  if (filter.query && !matchesQuery(row, filter.query)) return false
  return true
}

function rowSortKey(row: TransactionListRow): string {
  if (row.kind === 'transaction') return `1:${row.txn.date}:${row.txn.id}`
  return `0:${row.date}:${row.key}`
}

export function buildTransactionListRows(
  transactions: Transaction[],
  filter: TxnFilter,
  statements: AccountStatement[],
  cashRows: CashRow[],
  accounts: Account[],
  settings: { defaultAccountId: number | null },
): TransactionListRow[] {
  const txns = filterTransactions(transactions, filter).map(
    (txn): TransactionListRow => ({ kind: 'transaction', txn }),
  )
  const payments = buildStatementPayments(
    statements,
    cashRows,
    accounts,
    settings.defaultAccountId,
  )
    .filter((row) => matchesStatementPayment(row, filter))
    .map((row) => row as TransactionListRow)

  return [...txns, ...payments].sort((a, b) => rowSortKey(b).localeCompare(rowSortKey(a)))
}

export function listRowDate(row: TransactionListRow): string {
  return row.kind === 'transaction' ? row.txn.date : row.date
}

export function listRowKey(row: TransactionListRow): string {
  return row.kind === 'transaction' ? `txn:${row.txn.id}` : row.key
}

export interface ListDayGroup {
  date: string
  rows: TransactionListRow[]
}

export function groupListRowsByDay(rows: TransactionListRow[]): ListDayGroup[] {
  const groups: ListDayGroup[] = []
  for (const row of rows) {
    const date = listRowDate(row)
    const last = groups[groups.length - 1]
    if (last && last.date === date) last.rows.push(row)
    else groups.push({ date, rows: [row] })
  }
  return groups
}
