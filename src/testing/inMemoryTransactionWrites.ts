import { AMOUNT_SIGN_MESSAGE, amountSignAllowed } from '../domain/data/amountSign'
import type { NewTransaction } from '../domain/data/dataSource'
import { withoutSettlement } from '../domain/engine/flagGroups'
import type { StoredTransaction, Transaction } from '../domain/types'
import { RepoHttpError } from './repoHttpError'
import { dropAttachmentsFor } from './inMemoryAttachments'
import {
  assertOwnedAccount,
  assertOwnedCategory,
  assertOwnedFlag,
  assertOwnedPlan,
  findStored,
  maybeApplyAutoLabel,
} from './inMemoryGuards'
import { deriveOne, nextId, type InMemoryState, type Op, type OwnerStore } from './inMemoryStore'

/**
 * Release rows that pointed at a deleted reimbursement, as the D1 cascade does.
 *
 * Without it the double lets a payment go while the rows it covered keep
 * pointing at it — so they stay out of the Flagged card, neither owed nor
 * reimbursed, and every test of the undo passes against the wrong behaviour.
 */
export function releaseSettledBy(
  store: OwnerStore,
  deletedIds: number[],
): void {
  const gone = new Set(deletedIds)
  store.transactions = store.transactions.map((row) =>
    row.settledBy != null && gone.has(row.settledBy) ? withoutSettlement(row) : row,
  )
}

/**
 * Resolve and validate the installment index for a plan-linked write. On
 * update, `excludeId` skips the row being saved so re-saving it at its own
 * index (or moving plans) is allowed.
 */
export function resolvePlanLink(
  store: OwnerStore,
  input: { planId?: number | null; installmentIndex?: number },
  excludeId?: number,
): { planId: number; installmentIndex: number } | null {
  if (input.planId == null) return null
  const plan = assertOwnedPlan(store, input.planId)
  const existing = store.transactions
    .filter((t) => t.planId === plan.id && typeof t.installmentIndex === 'number' && t.id !== excludeId)
    .map((t) => t.installmentIndex as number)
  const nextIndex = existing.length > 0 ? Math.max(...existing) + 1 : plan.startInstallmentIndex
  const installmentIndex = input.installmentIndex ?? nextIndex
  if (existing.includes(installmentIndex)) {
    throw new RepoHttpError(400, 'Installment already recorded for this index')
  }
  return { planId: plan.id, installmentIndex }
}

export function insertOne(
  state: InMemoryState,
  owner: string,
  input: NewTransaction,
): Transaction {
  const store = state.storeFor(owner)
  assertOwnedAccount(store, input.accountId)
  assertOwnedCategory(store, input.categoryId)
  if (input.flagId != null) assertOwnedFlag(store, input.flagId)
  const planLink = resolvePlanLink(store, input)
  const stored: StoredTransaction = {
    id: nextId(store.transactions),
    date: input.date,
    budgetMonth: input.budgetMonth,
    description: input.description,
    accountId: input.accountId,
    categoryId: input.categoryId,
    type: input.type,
    amountCents: input.amountCents,
    cancelled: input.cancelled,
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.flagId != null ? { flagId: input.flagId } : {}),
    ...(planLink ?? {}),
  }
  store.transactions.push(stored)
  maybeApplyAutoLabel(store, stored.id, input.flagId ?? undefined)
  return deriveOne(stored, store.accounts, store.statements, store.transactionLabels)
}

export const insertTransaction: Op<'insertTransaction'> = (
  state,
  owner,
  input,
) => Promise.resolve(insertOne(state, owner, input))

export const updateTransaction: Op<'updateTransaction'> = (
  state,
  owner,
  id,
  patch,
) => {
  const store = state.storeFor(owner)
  const existing = findStored(store, id)
  if (patch.accountId != null) assertOwnedAccount(store, patch.accountId)
  if (patch.categoryId != null) assertOwnedCategory(store, patch.categoryId)
  const keys = Object.keys(patch) as (keyof NewTransaction)[]
  if (keys.length === 0) throw new RepoHttpError(400, 'Empty patch')
  // Mirrors the D1 adapter: the row after the patch may not carry a withdrawal on
  // anything but an investment.
  if (!amountSignAllowed(patch.amountCents ?? existing.amountCents, patch.type ?? existing.type)) {
    throw new RepoHttpError(400, AMOUNT_SIGN_MESSAGE)
  }
  const { planId: nextPlanId, installmentIndex: nextIndex, flagId: nextFlagId, ...rest } = patch
  let updated: StoredTransaction = { ...existing, ...rest, id: existing.id }
  if ('flagId' in patch) {
    // Mirrors the D1 adapter: null clears the flag, an id sets it after an
    // ownership check, absent leaves it alone.
    if (nextFlagId == null) delete updated.flagId
    else {
      updated = { ...updated, flagId: assertOwnedFlag(store, nextFlagId).id }
      maybeApplyAutoLabel(store, id, nextFlagId)
    }
  }
  if ('planId' in patch) {
    if (nextPlanId == null) {
      delete updated.planId
      delete updated.installmentIndex
    } else {
      const link = resolvePlanLink(
        store,
        { planId: nextPlanId, ...(nextIndex != null ? { installmentIndex: nextIndex } : {}) },
        id,
      )!
      updated = { ...updated, planId: link.planId, installmentIndex: link.installmentIndex }
    }
  }
  const index = store.transactions.findIndex((row) => row.id === id)
  store.transactions[index] = updated
  return Promise.resolve(deriveOne(updated, store.accounts, store.statements, store.transactionLabels))
}

export const deleteTransaction: Op<'deleteTransaction'> = (
  state,
  owner,
  id,
) => {
  const store = state.storeFor(owner)
  const index = store.transactions.findIndex((row) => row.id === id)
  if (index < 0) return Promise.resolve()
  store.transactions.splice(index, 1)
  store.transactionLabels = store.transactionLabels.filter((tl) => tl.transactionId !== id)
  // Mirrors the D1 cascade; without it the double would let a transaction
  // go while leaving attachment rows the real backend removes.
  dropAttachmentsFor(state, owner, store, [id])
  releaseSettledBy(store, [id])
  return Promise.resolve()
}

export const deleteTransactions: Op<'deleteTransactions'> = (
  state,
  owner,
  ids,
) => {
  const store = state.storeFor(owner)
  const idSet = new Set(ids)
  const before = store.transactions.length
  store.transactions = store.transactions.filter((row) => !idSet.has(row.id))
  store.transactionLabels = store.transactionLabels.filter((tl) => !idSet.has(tl.transactionId))
  dropAttachmentsFor(state, owner, store, ids)
  releaseSettledBy(store, ids)
  return Promise.resolve(before - store.transactions.length)
}

export const bulkInsertTransactions: Op<'bulkInsertTransactions'> = (
  state,
  owner,
  inputs,
) => Promise.resolve(inputs.map((input) => insertOne(state, owner, input)))
