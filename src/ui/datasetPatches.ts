import { planProgress } from '../domain/engine/installments'
import type { AccountStatement, CashActual, ExpenseDataset, Transaction, TransactionAttachment } from '../types'
import { cloneDataset, redriveTransactions, upsertById } from './datasetPatchHelpers'

function upsertStatement(
  list: AccountStatement[],
  row: AccountStatement,
): void {
  const i = list.findIndex((s) => s.accountId === row.accountId && s.yearMonth === row.yearMonth)
  if (i >= 0) list[i] = row
  else list.push(row)
}

/**
 * Mirrors the server's own auto-completion (maybeCompletePlan in dbWrite.ts) for
 * the local optimistic cache: any still-active plan whose linked transactions
 * now cover every installment is flipped inactive, same end state as clicking
 * "Complete" manually. The server write already committed the real flip; this
 * just keeps the "Manage plans" modal from looking stale until the next reload.
 */
function reconcileInstallmentPlanCompletion(d: ExpenseDataset): void {
  d.installmentPlans = d.installmentPlans.map((plan) =>
    plan.active && planProgress(plan, d.transactions).complete ? { ...plan, active: false } : plan,
  )
}

export function patchAfterTransactionCreate(
  dataset: ExpenseDataset,
  txn: Transaction,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.transactions = [...d.transactions, txn].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  reconcileInstallmentPlanCompletion(d)
  return d
}

export function patchAfterTransactionUpdate(
  dataset: ExpenseDataset,
  txn: Transaction,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.transactions = d.transactions.map((t) => (t.id === txn.id ? txn : t))
  reconcileInstallmentPlanCompletion(d)
  return d
}

export function patchAfterTransactionDelete(
  dataset: ExpenseDataset,
  id: number,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.transactions = d.transactions.filter((t) => t.id !== id)
  // Mirrors the server's cascade. Without it lookup.attachments() keeps
  // returning receipts for a transaction that no longer exists.
  d.attachments = d.attachments.filter((a) => a.transactionId !== id)
  return d
}

export function patchAfterBulkCreate(
  dataset: ExpenseDataset,
  txns: Transaction[],
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.transactions = [...d.transactions, ...txns].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  reconcileInstallmentPlanCompletion(d)
  return d
}

export function patchAfterBulkDelete(
  dataset: ExpenseDataset,
  ids: number[],
): ExpenseDataset {
  const drop = new Set(ids)
  const d = cloneDataset(dataset)
  d.transactions = d.transactions.filter((t) => !drop.has(t.id))
  d.attachments = d.attachments.filter((a) => !drop.has(a.transactionId))
  return d
}

export function patchAfterBulkUpdate(
  dataset: ExpenseDataset,
  updated: Transaction[],
): ExpenseDataset {
  const d = cloneDataset(dataset)
  const map = new Map(updated.map((t) => [t.id, t]))
  d.transactions = d.transactions.map((t) => map.get(t.id) ?? t)
  d.transactions.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  return d
}

export function patchAfterStatementPaid(
  dataset: ExpenseDataset,
  stmt: AccountStatement,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  upsertStatement(d.accountStatements, stmt)
  redriveTransactions(d)
  return d
}

export function patchAfterCashActual(
  dataset: ExpenseDataset,
  row: CashActual | null,
  yearMonth: string,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.cashActuals = d.cashActuals.filter((c) => c.yearMonth !== yearMonth)
  if (row) d.cashActuals.push(row)
  return d
}

export function patchAfterAttachmentAdd(
  dataset: ExpenseDataset,
  attachment: TransactionAttachment,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  upsertById(d.attachments, attachment)
  return d
}

export function patchAfterAttachmentDelete(
  dataset: ExpenseDataset,
  id: number,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.attachments = d.attachments.filter((a) => a.id !== id)
  return d
}
