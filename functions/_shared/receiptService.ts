import type { TransactionAttachment } from '../domain/types'
import type { ExpenseRepository } from '../domain/ports/expenseRepository'
import type { ReceiptStore } from '../domain/ports/receiptStore'
import {
  checkUpload,
  extensionFor,
  rejectionMessage,
  supportsThumbnail,
  type ReceiptLimits,
} from '../domain/data/receiptRules'
import { receiptKey, receiptThumbKey, sha256Hex } from './receiptKeys'
import { HttpError } from './http'

export interface UploadRequest {
  owner: string
  transactionId: number
  file: ArrayBuffer
  /** Optional pre-rendered preview; absent for PDFs and when canvas is unavailable. */
  thumb?: ArrayBuffer | undefined
  originalName?: string | undefined
  width?: number | undefined
  height?: number | undefined
}

/**
 * Store one receipt: validate, write the bytes, then record the metadata.
 *
 * Order matters. Bytes first means a failure between the two leaves an orphaned
 * R2 object — a few hundred KB, swept later. Metadata first would leave a row
 * pointing at bytes that do not exist, which renders as a broken receipt the
 * user cannot fix.
 */
export async function storeReceipt(
  repo: ExpenseRepository,
  store: ReceiptStore,
  limits: ReceiptLimits,
  request: UploadRequest,
): Promise<TransactionAttachment> {
  const { owner, transactionId } = request
  if (!(await repo.transactionExists(owner, transactionId))) {
    throw new HttpError(400, 'Invalid transactionId')
  }
  const bytes = new Uint8Array(request.file)
  const [existing, ownerBytesUsed] = await Promise.all([
    repo.listAttachments(owner, transactionId),
    repo.attachmentBytesUsed(owner),
  ])

  const check = checkUpload({
    bytes,
    existingCount: existing.length,
    ownerBytesUsed,
    limits,
  })
  if (!check.ok) throw new HttpError(400, rejectionMessage(check.reason))

  const hash = await sha256Hex(request.file)
  const objectKey = receiptKey(owner, transactionId, hash, extensionFor(check.contentType))
  const thumbKey =
    request.thumb && supportsThumbnail(check.contentType)
      ? receiptThumbKey(owner, transactionId, hash)
      : undefined

  await store.put(objectKey, request.file, check.contentType)
  if (thumbKey && request.thumb) await store.put(thumbKey, request.thumb, 'image/jpeg')

  return repo.createAttachment(owner, {
    transactionId,
    objectKey,
    contentType: check.contentType,
    byteSize: bytes.length,
    ...(thumbKey ? { thumbKey } : {}),
    ...(request.originalName ? { originalName: request.originalName } : {}),
    ...(request.width != null ? { width: request.width } : {}),
    ...(request.height != null ? { height: request.height } : {}),
  })
}

export async function removeReceipt(
  repo: ExpenseRepository,
  store: ReceiptStore,
  owner: string,
  id: number,
): Promise<void> {
  const { objectKey, thumbKey } = await repo.deleteAttachment(owner, id)
  // Row first: bytes without a row is wasted storage, a row without bytes is a
  // receipt the user sees and cannot open.
  await store.deleteMany(thumbKey ? [objectKey, thumbKey] : [objectKey])
}
