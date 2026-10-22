import type { LedgerPartsSource } from './dataSource'
import { toApiError } from './apiClient'
import type {
  CubePart,
  MonthRange,
  MonthRowsPart,
  ReferencePart,
  SeriesPart,
  TransactionPagePart,
  TransactionSummaryPart,
} from '../domain/data/ledgerParts'
import { transactionQueryString } from './transactionQueryString'
import type { TransactionAttachment } from '../domain/types'
import { ValidationError } from '../domain/application/validationError'
import { PartTooLargeError, PartsUnavailableError } from '../domain/data/ledgerPartsErrors'

const BASE = '/api/expenses'

const REFERENCE_TABLES = [
  'categories',
  'accounts',
  'flags',
  'labels',
  'accountStatements',
  'cashActuals',
  'installmentPlans',
  'goalScenarios',
  'wealthAccounts',
  'wealthCheckins',
] as const

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Just enough of each shape that the code after it cannot crash on a body from another version. */
function isReferencePart(body: unknown): body is ReferencePart {
  if (!isObject(body) || typeof body.revision !== 'string') return false
  const { reference } = body
  return (
    isObject(reference) &&
    isObject(reference.settings) &&
    REFERENCE_TABLES.every((table) => Array.isArray(reference[table])) &&
    Array.isArray(body.pinned) &&
    Array.isArray(body.months) &&
    isObject(body.attachmentCounts) &&
    isObject(body.rowsPerMonth) &&
    typeof body.rowCount === 'number'
  )
}

function isMonthRowsPart(body: unknown): body is MonthRowsPart {
  return (
    isObject(body) &&
    typeof body.revision === 'string' &&
    typeof body.from === 'string' &&
    typeof body.to === 'string' &&
    Array.isArray(body.transactions) &&
    isObject(body.attachmentCounts)
  )
}

function isCubePart(body: unknown): body is CubePart {
  return (
    isObject(body) &&
    typeof body.revision === 'string' &&
    typeof body.from === 'string' &&
    typeof body.to === 'string' &&
    Array.isArray(body.cells)
  )
}

/** A series the detectors read without a check of their own: a text label and the lists they index into. */
function isSeriesPart(body: unknown): body is SeriesPart {
  return (
    isObject(body) &&
    typeof body.revision === 'string' &&
    Array.isArray(body.series) &&
    body.series.every(
      (s) =>
        isObject(s) &&
        typeof s.label === 'string' &&
        Array.isArray(s.newestDates) &&
        s.newestDates.length > 0 &&
        Array.isArray(s.olderGaps) &&
        Array.isArray(s.budgetMonths) &&
        Array.isArray(s.budgetOffsets),
    )
  )
}

function isReceiptList(body: unknown): body is TransactionAttachment[] {
  return (
    Array.isArray(body) &&
    body.every((item) => isObject(item) && typeof item.id === 'number' && typeof item.transactionId === 'number')
  )
}

function isTransactionPage(body: unknown): body is TransactionPagePart {
  return (
    isObject(body) &&
    (body.nextCursor === null || typeof body.nextCursor === 'string') &&
    Array.isArray(body.items) &&
    body.items.every((row) => isObject(row) && typeof row.id === 'number' && typeof row.date === 'string')
  )
}

function isTransactionSummary(body: unknown): body is TransactionSummaryPart {
  return (
    isObject(body) &&
    typeof body.revision === 'string' &&
    typeof body.count === 'number' &&
    typeof body.capped === 'boolean' &&
    typeof body.netSpendCents === 'number'
  )
}

function unavailable(url: string, detail: string): PartsUnavailableError {
  return new PartsUnavailableError(`${url} is not served here (${detail})`)
}

/**
 * What a response means for a part. A server that has no such route answers 404, or the single-page
 * app's index.html with a 200 that is not JSON; a body that is JSON but the wrong shape is a deploy
 * whose parts changed format. Both mean the caller should load the way it always has. A 400 is the
 * server refusing a range for its size, which the caller answers with a smaller range, unless `refused` says
 * what else a 400 means for this read (a list or summary refuses a filter or a cursor).
 */
async function bodyOf(
  url: string,
  res: Response,
  refused: (message: string) => Error = (message) => new PartTooLargeError(message),
): Promise<unknown> {
  if (!res.ok) {
    const error = await toApiError(res)
    if (res.status === 404 || res.status === 405 || res.status === 501) throw unavailable(url, `HTTP ${res.status}`)
    if (res.status === 400) throw refused(error.message)
    throw error
  }
  try {
    return await res.json()
  } catch {
    throw unavailable(url, 'not JSON')
  }
}

const fetchPart = (url: string, init?: RequestInit): Promise<Response> =>
  fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' }, ...init })

/**
 * Parts carry `Cache-Control: private, no-cache` and an ETag, so the browser keeps the body and asks
 * before using it: an unchanged ledger is answered with a 304 that costs two rows read, and the page sees
 * the cached body. No validator is kept here, because a request that names one by hand skips the
 * browser's cache and the 304 would then have nothing to return. A 304 that reaches this code anyway
 * (something between the browser and the page answered a conditional request) has no body, so the part
 * is read again past every cache.
 */
async function readPart<T>(url: string, check: (body: unknown) => body is T): Promise<T> {
  let res = await fetchPart(url)
  if (res.status === 304) res = await fetchPart(url, { cache: 'reload' })
  const body = await bodyOf(url, res)
  if (!check(body)) throw unavailable(url, 'unexpected shape')
  return body
}

/**
 * A list or summary is read as it is now, and never from a cache. A 400 is the server refusing the filter or the
 * cursor, a `ValidationError` as the demo source throws for the same input, and not a range too large to read.
 */
async function readFresh<T>(
  url: string,
  check: (body: unknown) => body is T,
  signal: AbortSignal | undefined,
): Promise<T> {
  const res = await fetchPart(url, { cache: 'no-store', ...(signal ? { signal } : {}) })
  const body = await bodyOf(url, res, (message) => new ValidationError(message))
  if (!check(body)) throw unavailable(url, 'unexpected shape')
  return body
}

const query = (range: MonthRange): string => `from=${range.from}&to=${range.to}`

export const apiLedgerParts: LedgerPartsSource = {
  readReferencePart: () => readPart(`${BASE}/reference`, isReferencePart),
  readMonthsPart: (range) => readPart(`${BASE}/transactions/months?${query(range)}`, isMonthRowsPart),
  readCubePart: (range) => readPart(`${BASE}/cube?${query(range)}`, isCubePart),
  readSeriesPart: () => readPart(`${BASE}/series`, isSeriesPart),
  readReceiptsPart: (transactionId) =>
    readPart(`${BASE}/attachments${transactionId === undefined ? '' : `?transactionId=${transactionId}`}`, isReceiptList),
  readTransactionPage: (filter, request) =>
    readFresh(`${BASE}/transactions/list?${transactionQueryString(filter, request)}`, isTransactionPage, request?.signal),
  readTransactionSummary: (filter, request) =>
    readFresh(`${BASE}/transactions/summary?${transactionQueryString(filter)}`, isTransactionSummary, request?.signal),
}
