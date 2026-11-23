import type { ExpenseDataset } from '../../types'
import { computeCashReconciliation } from '../../engine'
import { isStatementPaid } from '../../engine/status'

export interface StatementRow {
  id: number
  name: string
  chargeCents: number
  paid: boolean
  paidOn?: string | undefined
}

function findPaidOn(
  statements: ExpenseDataset['accountStatements'],
  accountId: number,
  yearMonth: string,
): string | undefined {
  return statements.find((s) => s.accountId === accountId && s.yearMonth === yearMonth)?.paidOn
}

/** One row per active deferred-settlement card, with its charge for the month and whether it is paid. */
export function buildStatementRows(
  dataset: ExpenseDataset,
  month: string,
): StatementRow[] {
  const deferred = dataset.accounts.filter((a) => a.settlement === 'deferred' && a.active)
  if (deferred.length === 0) return []

  const rows = computeCashReconciliation(dataset.transactions, dataset.accounts, dataset.settings, dataset.cashActuals)
  const row = rows.find((r) => r.month === month)

  return deferred.map((account) => ({
    id: account.id,
    name: account.name,
    chargeCents: row?.cardCharges.get(account.id)?.chargeCents ?? 0,
    paid: isStatementPaid(dataset.accountStatements, account.id, month),
    paidOn: findPaidOn(dataset.accountStatements, account.id, month),
  }))
}
