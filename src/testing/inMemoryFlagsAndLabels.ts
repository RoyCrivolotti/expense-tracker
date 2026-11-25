import { withoutFlag } from '../domain/engine/flagGroups'
import type { ExpenseFlagsAndLabels } from '../domain/ports/expenseReference'
import type { Flag, Label } from '../domain/types'
import { RepoHttpError } from './repoHttpError'
import {
  alreadyLabeled,
  assertOwnedFlag,
  assertOwnedLabel,
  assertOwnedTransactionId,
  findStored,
} from './inMemoryGuards'
import { deriveOne, nextId, type InMemoryState, type Op, type OwnerStore, using } from './inMemoryStore'

/** Same reason as withoutFlag/withoutSettlement in flagGroups.ts: exactOptionalPropertyTypes
 *  means "no auto-label" has to be an absent key, not an assigned undefined. */
export function withoutAutoLabel({ autoLabelId: _autoLabelId, ...rest }: Flag): Flag {
  return rest
}

/**
 * Mirrors dbLabels.ts's applyLabelToFlaggedTransactionsStatement: every
 * transaction currently carrying `flagId` picks up `labelId`, deduped against
 * one it already has some other way.
 */
export function applyLabelToFlaggedTransactions(
  store: OwnerStore,
  flagId: number,
  labelId: number,
): void {
  for (const t of store.transactions) {
    if (t.flagId === flagId && !alreadyLabeled(store, t.id, labelId)) {
      store.transactionLabels.push({ transactionId: t.id, labelId })
    }
  }
}

export const createFlag: Op<'createFlag'> = (
  state,
  owner,
  input,
) => {
  const store = state.storeFor(owner)
  const { autoLabelId, ...rest } = input
  const flag: Flag = { ...rest, id: nextId(store.flags), ...(autoLabelId != null ? { autoLabelId } : {}) }
  store.flags.push(flag)
  store.flags.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  return Promise.resolve({ ...flag })
}

export const updateFlag: Op<'updateFlag'> = (
  state,
  owner,
  id,
  patch,
) => {
  const store = state.storeFor(owner)
  const index = store.flags.findIndex((f) => f.id === id)
  if (index < 0) throw new RepoHttpError(404, 'Flag not found')
  if (Object.keys(patch).length === 0) throw new RepoHttpError(400, 'Empty patch')
  if (patch.autoLabelId != null) assertOwnedLabel(store, patch.autoLabelId)
  const current = store.flags[index] as Flag
  const { description, autoLabelId, ...rest } = patch
  const next: Flag = { ...current, ...rest, id }
  // '' is how the editor clears a description; drop the key rather than
  // storing an empty string (exactOptionalPropertyTypes forbids undefined).
  if (description !== undefined) {
    if (description === '') delete next.description
    else next.description = description
  }
  // null is how the editor clears the auto-label; same reasoning as description.
  if (autoLabelId !== undefined) {
    if (autoLabelId == null) delete next.autoLabelId
    else next.autoLabelId = autoLabelId
  }
  store.flags[index] = next
  store.flags.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  // Retroactive: mirrors dbFlags.ts's updateFlag calling
  // applyLabelToFlaggedTransactionsStatement after the same write.
  if (autoLabelId != null) applyLabelToFlaggedTransactions(store, id, autoLabelId)
  return Promise.resolve({ ...next })
}

export const deleteFlag: Op<'deleteFlag'> = (
  state,
  owner,
  id,
) => {
  const store = state.storeFor(owner)
  assertOwnedFlag(store, id)
  let unflagged = 0
  store.transactions = store.transactions.map((t) => {
    if (t.flagId !== id) return t
    unflagged += 1
    return withoutFlag(t)
  })
  store.flags = store.flags.filter((f) => f.id !== id)
  return Promise.resolve({ unflagged })
}

export const createLabel: Op<'createLabel'> = (
  state,
  owner,
  input,
) => {
  const store = state.storeFor(owner)
  const label: Label = { ...input, id: nextId(store.labels) }
  store.labels.push(label)
  store.labels.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  return Promise.resolve({ ...label })
}

export const updateLabel: Op<'updateLabel'> = (
  state,
  owner,
  id,
  patch,
) => {
  const store = state.storeFor(owner)
  const index = store.labels.findIndex((l) => l.id === id)
  if (index < 0) throw new RepoHttpError(404, 'Label not found')
  if (Object.keys(patch).length === 0) throw new RepoHttpError(400, 'Empty patch')
  const current = store.labels[index] as Label
  const { description, ...rest } = patch
  const next: Label = { ...current, ...rest, id }
  // '' is how the editor clears a description; drop the key rather than
  // storing an empty string (exactOptionalPropertyTypes forbids undefined).
  if (description !== undefined) {
    if (description === '') delete next.description
    else next.description = description
  }
  store.labels[index] = next
  store.labels.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  return Promise.resolve({ ...next })
}

export const deleteLabel: Op<'deleteLabel'> = (
  state,
  owner,
  id,
) => {
  const store = state.storeFor(owner)
  assertOwnedLabel(store, id)
  const before = store.transactionLabels.length
  store.transactionLabels = store.transactionLabels.filter((tl) => tl.labelId !== id)
  // A flag configured to auto-apply this label must not keep pointing at a
  // label that no longer exists (migration 0029's own invariant).
  store.flags = store.flags.map((f) => (f.autoLabelId === id ? withoutAutoLabel(f) : f))
  store.labels = store.labels.filter((l) => l.id !== id)
  return Promise.resolve({ unlabeled: before - store.transactionLabels.length })
}

export const setTransactionLabels: Op<'setTransactionLabels'> = (
  state,
  owner,
  transactionId,
  labelIds,
) => {
  const store = state.storeFor(owner)
  assertOwnedTransactionId(store, transactionId, 'transactionId')
  const deduped = [...new Set(labelIds)]
  for (const labelId of deduped) assertOwnedLabel(store, labelId)
  store.transactionLabels = store.transactionLabels.filter((tl) => tl.transactionId !== transactionId)
  for (const labelId of deduped) store.transactionLabels.push({ transactionId, labelId })
  const stored = findStored(store, transactionId)
  return Promise.resolve(deriveOne(stored, store.accounts, store.statements, store.transactionLabels))
}

export function flagsAndLabels(state: InMemoryState): ExpenseFlagsAndLabels {
  return {
    createFlag: using(state, createFlag),
    updateFlag: using(state, updateFlag),
    deleteFlag: using(state, deleteFlag),
    createLabel: using(state, createLabel),
    updateLabel: using(state, updateLabel),
    deleteLabel: using(state, deleteLabel),
    setTransactionLabels: using(state, setTransactionLabels),
  }
}
