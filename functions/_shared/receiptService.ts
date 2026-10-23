import type { TransactionAttachment } from '../domain/types'
import type { NewAttachment } from '../domain/data/dataSource'
import type { ExpenseRepository } from '../domain/ports/expenseRepository'
import type { ReceiptStore } from '../domain/ports/receiptStore'
import {
  checkThumb,
  checkUpload,
  extensionFor,
  rejectionMessage,
  supportsThumbnail,
  type ReceiptContentType,
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
/**
 * The thumbnail is client-supplied like the file, so it gets the same
 * treatment: unchecked, a raw API call could store an arbitrarily large,
 * unsniffed object that never counted against the quota.
 */
function validatedThumb(
  thumb: ArrayBuffer | undefined,
  fileBytes: number,
  ownerBytesUsed: number,
  limits: ReceiptLimits,
): Uint8Array | null {
  if (!thumb) return null
  const thumbBytes = new Uint8Array(thumb)
  const check = checkThumb(thumbBytes, limits)
  if (!check.ok) throw new HttpError(400, rejectionMessage(check.reason))
  if (ownerBytesUsed + fileBytes + thumbBytes.length > limits.maxOwnerBytes) {
    throw new HttpError(400, rejectionMessage({ kind: 'owner-quota', limit: limits.maxOwnerBytes }))
  }
  return thumbBytes
}

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

  const thumbBytes = validatedThumb(request.thumb, bytes.length, ownerBytesUsed, limits)

  const hash = await sha256Hex(request.file)
  const objectKey = receiptKey(owner, transactionId, hash, extensionFor(check.contentType))
  const thumbKey =
    thumbBytes && supportsThumbnail(check.contentType)
      ? receiptThumbKey(owner, transactionId, hash)
      : undefined

  await store.put(objectKey, request.file, check.contentType)
  if (thumbKey && request.thumb) await store.put(thumbKey, request.thumb, 'image/jpeg')

  return repo.createAttachment(
    owner,
    attachmentRecord(request, objectKey, check.contentType, bytes.length, thumbKey, thumbBytes),
  )
}

/** Assembled separately so storeReceipt stays under the complexity budget. */
function attachmentRecord(
  request: UploadRequest,
  objectKey: string,
  contentType: ReceiptContentType,
  fileBytes: number,
  thumbKey: string | undefined,
  thumbBytes: Uint8Array | null,
): NewAttachment {
  return {
    transactionId: request.transactionId,
    objectKey,
    contentType,
    // Everything this attachment occupies, so the quota reflects real storage.
    byteSize: fileBytes + (thumbKey && thumbBytes ? thumbBytes.length : 0),
    ...(thumbKey ? { thumbKey } : {}),
    ...(request.originalName ? { originalName: request.originalName } : {}),
    ...(request.width != null ? { width: request.width } : {}),
    ...(request.height != null ? { height: request.height } : {}),
  }
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

/**
 * Run a delete of transactions, then remove the receipt bytes of the rows it took.
 *
 * The keys are read first, while the rows naming them exist, but nothing leaves the bucket until the delete has
 * succeeded. In the other order a delete that is then refused or fails leaves rows whose files are gone, and
 * receipts are in no backup. Removing the bytes is best effort and never fails the caller: an object left behind
 * costs a few hundred KB, a row left without its bytes costs the receipt. Reading the keys is not best effort; if
 * it fails nothing has been deleted and the request can be repeated.
 */
export async function deleteWithReceipts<T>(
  repo: ExpenseRepository,
  store: ReceiptStore | null,
  owner: string,
  transactionIds: number[],
  deleteRows: () => Promise<T>,
): Promise<T> {
  const keys = store && transactionIds.length > 0 ? await repo.attachmentKeysForTransactions(owner, transactionIds) : []
  const result = await deleteRows()
  if (store && keys.length > 0) {
    try {
      await store.deleteMany(keys)
    } catch {
      /* best effort: see above */
    }
  }
  return result
}
