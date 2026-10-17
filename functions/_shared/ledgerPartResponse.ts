import { type PartName, ifNoneMatchMatches, partEtag } from './datasetEtag'
import { readOwnerRevision } from './dbRevision'
import { json } from './http'

export interface ServePart<T extends object> {
  db: D1Database
  owner: string
  request: Request
  part: PartName
  /** The range asked for, so that a tag held for another range never matches. */
  scope?: string
  /**
   * Runs before the data is read when the browser's copy is not current, and may change what the
   * revision is (the installment backfill inserts rows). Nothing runs for a 304.
   */
  beforeRead?: () => Promise<void>
  read: () => Promise<T>
}

/**
 * One ledger part as the dataset route serves the dataset: `no-cache` lets the browser keep the body
 * but makes it ask first, and a matching `If-None-Match` is answered with a 304 after two rows are read.
 * The body carries the revision token it was read under, which a client compares across parts.
 *
 * The tag is read before the data. After `beforeRead` it is read again, so a backfill that moved the
 * revision is not left behind a tag that the next request would already miss; that second read still
 * happens before the data, so the tag can only be older than the data, never newer.
 */
export async function servePart<T extends object>(options: ServePart<T>): Promise<Response> {
  const { db, owner, request, part, scope } = options
  let revision = await readOwnerRevision(db, owner)
  let etag = partEtag(part, revision, scope)
  if (ifNoneMatchMatches(request.headers.get('if-none-match'), etag)) {
    return withHeaders(new Response(null, { status: 304 }), etag)
  }
  if (options.beforeRead) {
    await options.beforeRead()
    revision = await readOwnerRevision(db, owner)
    etag = partEtag(part, revision, scope)
  }
  const body = await options.read()
  return withHeaders(json({ revision: revision.token, ...body }), etag)
}

function withHeaders(response: Response, etag: string): Response {
  response.headers.set('ETag', etag)
  response.headers.set('Cache-Control', 'private, no-cache')
  return response
}
