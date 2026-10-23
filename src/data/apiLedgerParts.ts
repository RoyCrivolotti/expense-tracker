import type { LedgerPartsSource } from './dataSource'
import { ApiError, toApiError } from './apiClient'
import type { MonthRange, SeriesPart } from '../domain/data/ledgerParts'
import type { DescriptionSuggestRequest, DescriptionSuggestResult } from '../domain/data/descriptionSuggest'
import {
  isCubePart,
  isMonthRowsPart,
  isReceiptList,
  isReferencePart,
  isSeriesPart,
  isSuggestResult,
  isTransactionPage,
  isTransactionSummary,
  isUsagePart,
} from './apiPartShapes'
import { transactionQueryString } from './transactionQueryString'
import { ValidationError } from '../domain/application/validationError'
import { PartTooLargeError, PartsUnavailableError } from '../domain/data/ledgerPartsErrors'

const BASE = '/api/expenses'
const SERIES_ATTEMPTS = 4
const SERIES_RETRY_MS = 1_100

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

/**
 * The series are worked out from every row, and for a while after the migration that stores the normalized
 * descriptions some rows still wait for theirs: the route answers 503 with a one second retry, and each try gets
 * further. A few tries are made at that pace before the 503 is given to the caller.
 */
async function whileFilling<T>(read: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await read()
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 503 || attempt >= SERIES_ATTEMPTS) throw error
      await new Promise((resolve) => setTimeout(resolve, SERIES_RETRY_MS))
      signal?.throwIfAborted()
    }
  }
}

const readSeries = (): Promise<SeriesPart> => whileFilling(() => readPart(`${BASE}/series`, isSeriesPart))

/** The matches among rows booked before a budget month, as now: a request is one prefix and the answer follows every write. */
function readSuggest(
  { prefix, before, limit, locale }: DescriptionSuggestRequest,
  signal: AbortSignal | undefined,
): Promise<DescriptionSuggestResult> {
  const params = new URLSearchParams({ q: prefix, limit: String(limit) })
  if (before !== undefined) params.set('before', before)
  if (locale !== undefined) params.set('locale', locale)
  return whileFilling(() => readFresh(`${BASE}/descriptions/suggest?${params}`, isSuggestResult, signal), signal)
}

export const apiLedgerParts: LedgerPartsSource = {
  readReferencePart: () => readPart(`${BASE}/reference`, isReferencePart),
  readMonthsPart: (range) => readPart(`${BASE}/transactions/months?${query(range)}`, isMonthRowsPart),
  readCubePart: (range) => readPart(`${BASE}/cube?${query(range)}`, isCubePart),
  readSeriesPart: () => readSeries(),
  readUsagePart: () => readPart(`${BASE}/usage`, isUsagePart),
  readDescriptionSuggest: (request, options) => readSuggest(request, options?.signal),
  readReceiptsPart: (transactionId) =>
    readPart(`${BASE}/attachments${transactionId === undefined ? '' : `?transactionId=${transactionId}`}`, isReceiptList),
  readTransactionPage: (filter, request) =>
    readFresh(`${BASE}/transactions/list?${transactionQueryString(filter, request)}`, isTransactionPage, request?.signal),
  readTransactionSummary: (filter, request) =>
    readFresh(`${BASE}/transactions/summary?${transactionQueryString(filter)}`, isTransactionSummary, request?.signal),
}
