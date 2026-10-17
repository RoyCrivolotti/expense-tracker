import type { TransactionKey } from '../data/transactionQuery'
import type { TxnFilter } from '../engine/transactions'
import { ValidationError } from './validationError'

/**
 * A list page's cursor is the last row it returned plus a digest of the filter it was cut from,
 * as base64url JSON. It is opaque to clients and carries no owner: the owner comes from the
 * session on every request, so a cursor lifted from another account only ever points at a place
 * in the caller's own rows. The digest is not a signature. It catches a filter that changed
 * between pages and a cursor mangled in transit; it cannot stop anyone from writing a position
 * by hand, which is harmless because a position reveals nothing the filter did not already allow.
 */
interface CursorBody {
  date: string
  id: number
  filterHash: string
}

const MAX_CURSOR_LENGTH = 200
const INVALID = 'Invalid cursor'

function toBase64Url(text: string): string {
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string {
  const padded = text.replaceAll('-', '+').replaceAll('_', '/')
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
}

/** Same filter, same digest, whatever order its fields were written in. */
export async function filterHash(filter: TxnFilter): Promise<string> {
  const fields = Object.entries(filter).sort(([a], [b]) => (a < b ? -1 : 1))
  const bytes = new TextEncoder().encode(JSON.stringify(fields))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function encodeCursor(key: TransactionKey, filter: TxnFilter): Promise<string> {
  const body: CursorBody = { date: key.date, id: key.id, filterHash: await filterHash(filter) }
  return toBase64Url(JSON.stringify(body))
}

function parseBody(cursor: string): CursorBody {
  let body: unknown
  try {
    const text = fromBase64Url(cursor)
    // A cursor is only ever what encodeCursor wrote; a differently spelled one was edited.
    if (toBase64Url(text) !== cursor) throw new Error('not canonical')
    body = JSON.parse(text)
  } catch {
    throw new ValidationError(INVALID)
  }
  if (!isCursorBody(body)) throw new ValidationError(INVALID)
  return body
}

function isCursorBody(body: unknown): body is CursorBody {
  if (body === null || typeof body !== 'object') return false
  if (Object.keys(body).sort().join() !== 'date,filterHash,id') return false
  const { date, id, filterHash: hash } = body as Record<string, unknown>
  return (
    typeof date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isSafeInteger(id) &&
    (id as number) > 0 &&
    typeof hash === 'string'
  )
}

/** The position a cursor names, provided it was cut from this same filter. */
export async function decodeCursor(cursor: unknown, filter: TxnFilter): Promise<TransactionKey> {
  if (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH) {
    throw new ValidationError(INVALID)
  }
  const body = parseBody(cursor)
  if (body.filterHash !== (await filterHash(filter))) {
    throw new ValidationError('This cursor was made for a different filter')
  }
  return { date: body.date, id: body.id }
}
