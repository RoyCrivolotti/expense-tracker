import type { ExpenseAttachments } from '../domain/ports/expenseLedger'
import type { TransactionAttachment } from '../domain/types'
import { RepoHttpError } from './repoHttpError'
import { nextId, type InMemoryState, type Op, type OwnerStore, using } from './inMemoryStore'

/** Attachment rows die with their transaction, as they do in D1. */
export function dropAttachmentsFor(
  state: InMemoryState,
  owner: string,
  store: OwnerStore,
  transactionIds: number[],
): void {
  const wanted = new Set(transactionIds)
  for (const attachment of store.attachments) {
    if (wanted.has(attachment.transactionId)) state.keysById.delete(state.keyOf(owner, attachment.id))
  }
  store.attachments = store.attachments.filter((a) => !wanted.has(a.transactionId))
}

export const transactionExists: Op<'transactionExists'> = (
  state,
  owner,
  id,
) => {
  const store = state.storeFor(owner)
  return Promise.resolve(store.transactions.some((t) => t.id === id))
}

export const listAttachments: Op<'listAttachments'> = (
  state,
  owner,
  transactionId,
) => {
  const store = state.storeFor(owner)
  const mine = store.attachments.filter((a) => transactionId === undefined || a.transactionId === transactionId)
  return Promise.resolve([...mine].sort((a, b) => a.transactionId - b.transactionId || a.id - b.id))
}

export const findAttachmentSource: Op<'findAttachmentSource'> = (
  state,
  owner,
  id,
) => {
  const store = state.storeFor(owner)
  const attachment = store.attachments.find((a) => a.id === id)
  const keys = state.keysById.get(state.keyOf(owner, id))
  if (!attachment || !keys) return Promise.resolve(null)
  return Promise.resolve({
    objectKey: keys.objectKey,
    contentType: attachment.contentType,
    ...(keys.thumbKey ? { thumbKey: keys.thumbKey } : {}),
    ...(attachment.originalName ? { originalName: attachment.originalName } : {}),
  })
}

export const createAttachment: Op<'createAttachment'> = (
  state,
  owner,
  input,
) => {
  const store = state.storeFor(owner)
  const attachment: TransactionAttachment = {
    id: nextId(store.attachments),
    transactionId: input.transactionId,
    contentType: input.contentType,
    byteSize: input.byteSize,
    createdAt: '2026-01-01T00:00:00Z',
    hasThumb: input.thumbKey != null,
    ...(input.width != null ? { width: input.width } : {}),
    ...(input.height != null ? { height: input.height } : {}),
    ...(input.originalName ? { originalName: input.originalName } : {}),
  }
  // The double lets the service assert the keys it wrote, which is the part
  // that has to match the D1 adapter.
  state.keysById.set(state.keyOf(owner, attachment.id), {
    objectKey: input.objectKey,
    ...(input.thumbKey ? { thumbKey: input.thumbKey } : {}),
  })
  store.attachments.push(attachment)
  return Promise.resolve({ ...attachment })
}

export const deleteAttachment: Op<'deleteAttachment'> = (
  state,
  owner,
  id,
) => {
  const store = state.storeFor(owner)
  const index = store.attachments.findIndex((a) => a.id === id)
  const keys = state.keysById.get(state.keyOf(owner, id))
  // Check before mutating, so a miss cannot leave the row deleted and the
  // caller told it was never there.
  if (index < 0 || !keys) throw new RepoHttpError(404, 'Attachment not found')
  store.attachments.splice(index, 1)
  state.keysById.delete(state.keyOf(owner, id))
  return Promise.resolve(keys)
}

export const attachmentBytesUsed: Op<'attachmentBytesUsed'> = (
  state,
  owner,
) => {
  const store = state.storeFor(owner)
  return Promise.resolve(store.attachments.reduce((sum, a) => sum + a.byteSize, 0))
}

export const attachmentKeysForTransactions: Op<'attachmentKeysForTransactions'> = (
  state,
  owner,
  transactionIds,
) => {
  const store = state.storeFor(owner)
  const wanted = new Set(transactionIds)
  return Promise.resolve(
    store.attachments
      .filter((a) => wanted.has(a.transactionId))
      .flatMap((a) => {
        const keys = state.keysById.get(state.keyOf(owner, a.id))
        if (!keys) return []
        return keys.thumbKey ? [keys.objectKey, keys.thumbKey] : [keys.objectKey]
      }),
  )
}

export function attachments(state: InMemoryState): ExpenseAttachments {
  return {
    transactionExists: using(state, transactionExists),
    listAttachments: using(state, listAttachments),
    findAttachmentSource: using(state, findAttachmentSource),
    createAttachment: using(state, createAttachment),
    deleteAttachment: using(state, deleteAttachment),
    attachmentBytesUsed: using(state, attachmentBytesUsed),
    attachmentKeysForTransactions: using(state, attachmentKeysForTransactions),
  }
}
