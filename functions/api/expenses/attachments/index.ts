import type { Env, ExpensesData } from '../../../_shared/env'
import { createR2ReceiptStore } from '../../../_shared/adapters/r2ReceiptStore'
import { singleParams } from '../../../_shared/ledgerPartParams'
import { mapAppError } from '../../../_shared/mapAppError'
import { receiptLimits } from '../../../_shared/receiptPolicy'
import { storeReceipt } from '../../../_shared/receiptService'
import { HttpError, json, readFormData } from '../../../_shared/http'

/**
 * A form entry is `string | File`, and `File` is a type but not a value in
 * @cloudflare/workers-types, so `instanceof` is unavailable — check structurally
 * for the part we actually use.
 */
interface UploadedFile {
  name?: string
  arrayBuffer(): Promise<ArrayBuffer>
}

function asFile(value: ReturnType<FormData["get"]>): UploadedFile | null {
  if (value == null || typeof value === 'string') return null
  return value
}

function requireFile(form: FormData, field: string): UploadedFile {
  const file = asFile(form.get(field))
  if (!file) throw new HttpError(400, `${field} is required`)
  return file
}

function optionalNumber(form: FormData, field: string): number | undefined {
  const raw = form.get(field)
  if (typeof raw !== 'string') return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

/**
 * The receipts of one transaction, oldest first: `?transactionId=`. The reference and rows parts say
 * which rows have any (`attachmentCounts`) instead of listing every receipt. A transaction that is not
 * the caller's has no receipts as far as the caller can tell.
 */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const { repo, owner } = context.data
  try {
    const { transactionId } = singleParams(new URL(context.request.url), ['transactionId'])
    const id = Number(transactionId)
    if (transactionId === undefined || !Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, 'Invalid transactionId')
    }
    return json(await repo.listAttachments(owner, id))
  } catch (error) {
    mapAppError(error)
  }
}

/**
 * The repo's only handler whose request body is binary. The response is still
 * JSON and failures still throw HttpError, so the `{ error }` contract holds.
 */
export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const bucket = context.env.RECEIPTS
  if (!bucket) {
    // Degrades the way backupService does when its binding is missing: a clear
    // answer rather than a crash, and the rest of the app is unaffected.
    return json({ error: 'Receipt storage is not configured' }, 503)
  }
  const form = await readFormData(context.request)
  const { repo, owner } = context.data
  try {
    const transactionId = Number(form.get('transactionId'))
    if (!Number.isInteger(transactionId) || transactionId <= 0) {
      throw new HttpError(400, 'Invalid transactionId')
    }
    const file = requireFile(form, 'file')
    const thumb = asFile(form.get('thumb'))
    return json(
      await storeReceipt(repo, createR2ReceiptStore(bucket), receiptLimits(context.env), {
        owner,
        transactionId,
        file: await file.arrayBuffer(),
        ...(thumb ? { thumb: await thumb.arrayBuffer() } : {}),
        ...(file.name ? { originalName: file.name } : {}),
        ...(optionalNumber(form, 'width') != null ? { width: optionalNumber(form, 'width') } : {}),
        ...(optionalNumber(form, 'height') != null
          ? { height: optionalNumber(form, 'height') }
          : {}),
      }),
      201,
    )
  } catch (error) {
    mapAppError(error)
  }
}
