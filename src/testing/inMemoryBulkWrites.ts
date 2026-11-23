import { AMOUNT_SIGN_MESSAGE } from '../domain/data/amountSign'
import { isFilterTarget } from '../domain/data/bulkEdit'
import type { BulkTransactionPatch } from '../domain/data/dataSource'
import { withoutFlag, withoutSettlement } from '../domain/engine/flagGroups'
import type { ExpenseRepository } from '../domain/ports/expenseRepository'
import type { StoredTransaction, Transaction } from '../domain/types'
import { assertLinksWithinCap, idsMatching } from './inMemoryBulkEdit'
import { RepoHttpError } from './repoHttpError'
import {
  assertOwnedAccount,
  assertOwnedCategory,
  assertOwnedFlag,
  assertOwnedLabel,
  assertOwnedTransactionId,
  maybeApplyAutoLabel,
} from './inMemoryGuards'
import { deriveOne, derivedTransactions, type InMemoryState, type Op, type OwnerStore } from './inMemoryStore'

/**
 * Mirrors reportSnapshotStatement in dbTransactionWrite.ts: a settle stamps the payment with what
 * it covered. Without it a test would show a past report that can never drift, and
 * the drift warning would be provably untested.
 */
export function stampReportSnapshot(
  store: OwnerStore,
  paymentId: number,
): void {
  const covered = store.transactions.filter((t) => t.settledBy === paymentId)
  store.transactions = store.transactions.map((t) =>
    t.id === paymentId
      ? {
          ...t,
          reportCount: covered.length,
          reportCoveredCents: covered.reduce(
            (sum, c) => sum + (c.type === 'refund' ? -c.amountCents : c.amountCents),
            0,
          ),
        }
      : t,
  )
}

/**
 * Mirrors the `settled_by IS NULL OR settled_by = ?` guard the D1 adapter puts on
 * its UPDATE. Without it this double accepts a second payment silently overwriting
 * the first, and the reimbursement integration suite — which runs only against this
 * double — would pass while production rejects the same input.
 */
export function assertNotSettledElsewhere(
  stored: StoredTransaction,
  settledBy: number,
): void {
  if (stored.settledBy != null && stored.settledBy !== settledBy) {
    throw new RepoHttpError(409, 'Transaction is already settled by another reimbursement')
  }
}

export function addLabels(
  state: InMemoryState,
  owner: string,
  target: Parameters<ExpenseRepository['addLabelsToTransactions']>[1],
  labelIds: number[],
): { matched: number; added: number } {
  const store = state.storeFor(owner)
  for (const labelId of labelIds) assertOwnedLabel(store, labelId)
  const ids = isFilterTarget(target) ? idsMatching(derivedTransactions(store), target) : target.ids
  assertLinksWithinCap(ids.length, labelIds.length)
  const wanted = new Set(ids)
  const owned = store.transactions.filter((t) => wanted.has(t.id)).map((t) => t.id)
  let added = 0
  for (const transactionId of owned) {
    for (const labelId of labelIds) {
      const has = store.transactionLabels.some((l) => l.transactionId === transactionId && l.labelId === labelId)
      if (!has) {
        store.transactionLabels.push({ transactionId, labelId })
        added += 1
      }
    }
  }
  return { matched: owned.length, added }
}

export const bulkUpdateTransactions: Op<'bulkUpdateTransactions'> = (
  state,
  owner,
  ids,
  patch: BulkTransactionPatch,
) => {
  const store = state.storeFor(owner)
  if (patch.accountId != null) assertOwnedAccount(store, patch.accountId)
  if (patch.categoryId != null) assertOwnedCategory(store, patch.categoryId)
  if (patch.flagId != null) assertOwnedFlag(store, patch.flagId)
  const idSet = new Set(ids)
  if (patch.type != null && patch.type !== 'investment') {
    // Mirrors the D1 adapter: a type change away from investment must not leave a
    // withdrawal on an expense row, and it is refused before anything is touched.
    if (store.transactions.some((t) => idSet.has(t.id) && t.amountCents < 0)) {
      throw new RepoHttpError(400, AMOUNT_SIGN_MESSAGE)
    }
  }
  if (patch.settledBy != null) {
    assertOwnedTransactionId(store, patch.settledBy)
    // Check every target before mutating any, so a conflict cannot leave half
    // the selection settled — the D1 path gets this from a single UPDATE.
    for (const stored of store.transactions) {
      if (idSet.has(stored.id)) assertNotSettledElsewhere(stored, patch.settledBy)
    }
  }
  const { flagId, settledBy, ...rest } = patch
  const updated: Transaction[] = []
  store.transactions = store.transactions.map((stored) => {
    if (!idSet.has(stored.id)) return stored
    // flagId and settledBy are handled separately: null clears them, and
    // clearing must omit the key rather than assign undefined
    // (exactOptionalPropertyTypes).
    const unflagged = 'flagId' in patch ? withoutFlag(stored) : stored
    const base = 'settledBy' in patch ? withoutSettlement(unflagged) : unflagged
    const withFlag: StoredTransaction = flagId != null ? { ...base, ...rest, flagId } : { ...base, ...rest }
    const next: StoredTransaction = settledBy != null ? { ...withFlag, settledBy } : withFlag
    // Before deriveOne below, not after the loop: deriveOne reads
    // store.transactionLabels for this row's labelIds right here.
    if (flagId != null) maybeApplyAutoLabel(store, next.id, flagId)
    updated.push(deriveOne(next, store.accounts, store.statements, store.transactionLabels))
    return next
  })
  if (patch.settledBy != null) stampReportSnapshot(store, patch.settledBy)
  return Promise.resolve(updated)
}

export const bulkUpdateTransactionsByFilter: Op<'bulkUpdateTransactionsByFilter'> = async (
  state,
  owner,
  target,
  patch,
) => {
  const ids = idsMatching(derivedTransactions(state.storeFor(owner)), target)
  if (ids.length > 0) await bulkUpdateTransactions(state, owner, ids, patch)
  return { updated: ids.length }
}

// A promise constructor turns a throw into a rejection, as the port promises and a database call does.
export const addLabelsToTransactions: Op<'addLabelsToTransactions'> = (
  state,
  owner,
  target,
  labelIds,
) => new Promise((resolve) => resolve(addLabels(state, owner, target, labelIds)))
