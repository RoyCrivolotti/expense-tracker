import { deriveTransactions } from '../engine/status'
import type { ExpenseDataset } from '../types'

export function cloneDataset(dataset: ExpenseDataset): ExpenseDataset {
  return structuredClone(dataset)
}

export function redriveTransactions(d: ExpenseDataset): void {
  d.transactions = deriveTransactions(d.transactions, d.accounts, d.accountStatements)
}

export function upsertById<T extends { id: number }>(
  list: T[],
  row: T,
): void {
  const i = list.findIndex((r) => r.id === row.id)
  if (i >= 0) list[i] = row
  else list.push(row)
}
