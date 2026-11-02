/**
 * What a write tells the browser that made it about the owner's revision, so that the browser can keep the revision it
 * holds across its own writes instead of forgetting it (docs/decisions/revision-token-and-etag.md).
 *
 * `before` is the token the ledger had when the request began. `after` is the token it has now, sent only when no
 * other write began or ended between the two bumps of this request: then the ledger at `after` is the ledger at
 * `before` plus this write, and plus any write that is still in flight around it, which moves the token again when it
 * ends. Either is absent when unknown, and a browser treats that as "no proof".
 */
export const REVISION_BEFORE_HEADER = 'x-revision-before'
export const REVISION_AFTER_HEADER = 'x-revision-after'

export interface WriteReceipt {
  before: string | null
  after: string | null
}

/** The receipt a response carries, or null for one that is not the answer to a write. */
export function readWriteReceipt(headers: Pick<Headers, 'get'>): WriteReceipt | null {
  const before = headers.get(REVISION_BEFORE_HEADER)
  const after = headers.get(REVISION_AFTER_HEADER)
  return before === null && after === null ? null : { before, after }
}
