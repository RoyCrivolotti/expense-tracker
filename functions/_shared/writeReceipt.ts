import { REVISION_AFTER_HEADER, REVISION_BEFORE_HEADER, type WriteReceipt } from '../domain/data/writeReceipt'

/**
 * The answer to a write that worked, with what it did to the owner's revision. A failed write gets none: the browser
 * that sent it reads the ledger again instead of trusting what it knows.
 */
export function withWriteReceipt(response: Response, receipt: WriteReceipt): Response {
  if (!response.ok) return response
  // A copy, since the headers of a response that came from `next()` may be immutable. The body is passed on unread.
  const copy = new Response(response.body, response)
  if (receipt.before !== null) copy.headers.set(REVISION_BEFORE_HEADER, receipt.before)
  if (receipt.after !== null) copy.headers.set(REVISION_AFTER_HEADER, receipt.after)
  return copy
}
