import type { Env, ExpensesData } from '../../../_shared/env'
import type { ReceiptContentType } from '../../../domain/data/receiptRules'
import { serveHeaders } from '../../../domain/data/receiptRules'
import { createR2ReceiptStore } from '../../../_shared/adapters/r2ReceiptStore'
import { mapAppError } from '../../../_shared/mapAppError'
import { parseNumericId } from '../../../_shared/params'
import { removeReceipt } from '../../../_shared/receiptService'
import { error, HttpError, json } from '../../../_shared/http'

/**
 * Serve the bytes.
 *
 * The client never names an R2 key: it asks for an attachment id, and the key is
 * resolved from the row, scoped by owner. That is the single most important
 * property here — no request that reaches this server can get an object the
 * caller does not own, whatever it puts in the URL.
 *
 * A request is not what a browser's cache answers with. The bytes are sent
 * `private, max-age=31536000, immutable` (`serveHeaders`), so on a browser two
 * people share, a receipt one of them opened is shown to the other, who types
 * its URL, without a request to this server until the entry expires or the cache
 * is cleared. Attachment ids are one sequence for every owner, so the URL is the
 * same only for the same receipt, and the other person has to know it.
 */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const bucket = context.env.RECEIPTS
  if (!bucket) return error(503, 'Receipt storage is not configured')
  const { repo, owner } = context.data
  try {
    const source = await repo.findAttachmentSource(owner, id)
    if (!source) throw new HttpError(404, 'Attachment not found')

    const wantsThumb = new URL(context.request.url).searchParams.get('variant') === 'thumb'
    const key = wantsThumb && source.thumbKey ? source.thumbKey : source.objectKey
    const object = await createR2ReceiptStore(bucket).get(key)
    if (!object) throw new HttpError(404, 'Attachment bytes are missing')

    // A thumbnail is always the JPEG we generated, whatever the original was.
    const contentType = (
      wantsThumb && source.thumbKey ? 'image/jpeg' : source.contentType
    ) as ReceiptContentType
    const headers = serveHeaders(contentType, source.originalName, object.etag)
    if (context.request.headers.get('if-none-match') === object.etag) {
      return new Response(null, { status: 304, headers })
    }
    return new Response(object.body, { headers })
  } catch (err) {
    mapAppError(err)
  }
}

export const onRequestDelete: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = parseNumericId(context.params, 'id')
  const bucket = context.env.RECEIPTS
  if (!bucket) return error(503, 'Receipt storage is not configured')
  const { repo, owner } = context.data
  try {
    await removeReceipt(repo, createR2ReceiptStore(bucket), owner, id)
    return json({ deleted: id })
  } catch (err) {
    mapAppError(err)
  }
}
