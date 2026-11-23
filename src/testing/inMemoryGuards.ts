import type { Account, Category, Flag, InstallmentPlan, Label, StoredTransaction } from '../domain/types'
import { RepoHttpError } from './repoHttpError'
import type { OwnerStore } from './inMemoryStore'

export function assertOwnedAccount(
  store: OwnerStore,
  accountId: number,
): Account {
  const account = store.accounts.find((a) => a.id === accountId)
  if (!account) throw new RepoHttpError(400, 'Invalid accountId')
  return account
}

export function assertOwnedCategory(
  store: OwnerStore,
  categoryId: number,
): Category {
  const category = store.categories.find((c) => c.id === categoryId)
  if (!category) throw new RepoHttpError(400, 'Invalid categoryId')
  return category
}

export function assertOwnedFlag(
  store: OwnerStore,
  flagId: number,
): Flag {
  const flag = store.flags.find((f) => f.id === flagId)
  if (!flag) throw new RepoHttpError(400, 'Invalid flagId')
  return flag
}

export function assertOwnedLabel(
  store: OwnerStore,
  labelId: number,
): Label {
  const label = store.labels.find((l) => l.id === labelId)
  if (!label) throw new RepoHttpError(400, 'Invalid labelId')
  return label
}

export function assertOwnedPlan(
  store: OwnerStore,
  planId: number,
): InstallmentPlan {
  const plan = store.installmentPlans.find((p) => p.id === planId)
  if (!plan) throw new RepoHttpError(400, 'Invalid planId')
  return plan
}

/** Mirrors assertOwnedTransaction in functions/_shared/ownership.ts. */
export function assertOwnedTransactionId(
  store: OwnerStore,
  transactionId: number,
  field = 'settledBy',
): void {
  if (!store.transactions.some((t) => t.id === transactionId)) {
    throw new RepoHttpError(400, `Invalid ${field}`)
  }
}

export function findStored(
  store: OwnerStore,
  id: number,
): StoredTransaction {
  const txn = store.transactions.find((row) => row.id === id)
  if (!txn) throw new RepoHttpError(404, 'Transaction not found')
  return txn
}

/** Whether `store.transactionLabels` already links this pair. */
export function alreadyLabeled(
  store: OwnerStore,
  transactionId: number,
  labelId: number,
): boolean {
  return store.transactionLabels.some((tl) => tl.transactionId === transactionId && tl.labelId === labelId)
}

/** Mirrors dbTransactionWrite.ts's maybeApplyAutoLabelStatement: the forward half. */
export function maybeApplyAutoLabel(
  store: OwnerStore,
  transactionId: number,
  flagId: number | undefined,
): void {
  if (flagId == null) return
  const labelId = store.flags.find((f) => f.id === flagId)?.autoLabelId
  if (labelId != null && !alreadyLabeled(store, transactionId, labelId)) {
    store.transactionLabels.push({ transactionId, labelId })
  }
}
