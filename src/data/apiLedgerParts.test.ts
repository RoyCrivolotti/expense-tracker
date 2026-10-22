import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './apiClient'
import { apiDataSource } from './apiDataSource'
import { apiLedgerParts } from './apiLedgerParts'
import { ValidationError } from '../domain/application/validationError'
import { PartTooLargeError, PartsUnavailableError } from '../domain/data/ledgerPartsErrors'
import { ledgerReferenceOf } from '../domain/ledger/partsOfDataset'
import { makeDataset, makeTransaction } from '../testing/factories'

const reference = {
  revision: 'abc',
  ...ledgerReferenceOf(makeDataset({ transactions: [makeTransaction({ id: 1 })] })),
}
const rows = { revision: 'abc', from: '2025-01', to: '2025-03', transactions: [], attachmentCounts: {} }
const cube = { revision: 'abc', from: '2025-01', to: '2025-03', cells: [] }

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

function serve(...responses: Response[]) {
  const fetchMock = vi.fn()
  for (const response of responses) fetchMock.mockResolvedValueOnce(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiLedgerParts', () => {
  it('reads the reference from /reference', async () => {
    const fetchMock = serve(json(reference))
    await expect(apiLedgerParts.readReferencePart()).resolves.toEqual(reference)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/expenses/reference')
    expect(init).toMatchObject({ credentials: 'same-origin' })
  })

  it('asks for a range of months with both ends in the query', async () => {
    const fetchMock = serve(json(rows), json(cube))
    await apiLedgerParts.readMonthsPart({ from: '2025-01', to: '2025-03' })
    await apiLedgerParts.readCubePart({ from: '2025-01', to: '2025-03' })
    expect(fetchMock.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      '/api/expenses/transactions/months?from=2025-01&to=2025-03',
      '/api/expenses/cube?from=2025-01&to=2025-03',
    ])
  })

  it('names no validator itself, so the browser revalidates the body it holds', async () => {
    const fetchMock = serve(json(reference))
    await apiLedgerParts.readReferencePart()
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(new Headers(init.headers).has('if-none-match')).toBe(false)
    expect(init.cache).toBeUndefined()
  })

  it('reads a part again past every cache when a 304 reaches it with no body to use', async () => {
    const fetchMock = serve(new Response(null, { status: 304 }), json(reference))
    await expect(apiLedgerParts.readReferencePart()).resolves.toEqual(reference)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ cache: 'reload' })
  })

  it.each([404, 405, 501])('reports a server without the route (%i) as unavailable', async (status) => {
    serve(json({ error: 'Not found' }, { status }))
    await expect(apiLedgerParts.readReferencePart()).rejects.toBeInstanceOf(PartsUnavailableError)
  })

  it('reports the single-page app answering with its HTML as unavailable', async () => {
    serve(new Response('<!doctype html><title>app</title>', { status: 200, headers: { 'content-type': 'text/html' } }))
    await expect(apiLedgerParts.readReferencePart()).rejects.toBeInstanceOf(PartsUnavailableError)
  })

  it.each([
    ['a reference without its tables', { revision: 'abc', reference: {} }],
    ['a reference with no revision', { ...reference, revision: undefined }],
    ['an array', []],
    ['null', null],
  ])('reports %s as unavailable', async (_name, body) => {
    serve(json(body))
    await expect(apiLedgerParts.readReferencePart()).rejects.toBeInstanceOf(PartsUnavailableError)
  })

  it('reports a rows part and a cube part of the wrong shape as unavailable', async () => {
    serve(json({ ...rows, transactions: 'none' }), json({ ...cube, cells: undefined }))
    await expect(apiLedgerParts.readMonthsPart({ from: '2025-01', to: '2025-03' })).rejects.toBeInstanceOf(PartsUnavailableError)
    await expect(apiLedgerParts.readCubePart({ from: '2025-01', to: '2025-03' })).rejects.toBeInstanceOf(PartsUnavailableError)
  })

  it('reports a range the server refuses for its size, with the server’s message', async () => {
    serve(json({ error: 'The range holds more than 10000 cells; ask for fewer months' }, { status: 400 }))
    await expect(apiLedgerParts.readCubePart({ from: '2015-01', to: '2025-01' })).rejects.toThrow(
      new PartTooLargeError('The range holds more than 10000 cells; ask for fewer months'),
    )
  })

  it('passes any other failure on as an ApiError with its status', async () => {
    serve(json({ error: 'Boom' }, { status: 500 }))
    await expect(apiLedgerParts.readReferencePart()).rejects.toEqual(new ApiError('Boom', 500))
  })
})

describe('apiLedgerParts, receipts', () => {
  const receipt = { id: 4, transactionId: 12, contentType: 'image/jpeg', byteSize: 10, createdAt: 'x', hasThumb: true }

  it('reads the receipts of one transaction from /attachments', async () => {
    const fetchMock = serve(json([receipt]))
    await expect(apiLedgerParts.readReceiptsPart(12)).resolves.toEqual([receipt])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/expenses/attachments?transactionId=12')
  })

  it('reads the receipts of every transaction in one request when none is named', async () => {
    const fetchMock = serve(json([receipt]))
    await expect(apiLedgerParts.readReceiptsPart()).resolves.toEqual([receipt])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/expenses/attachments')
  })

  it('accepts a transaction with none', async () => {
    serve(json([]))
    await expect(apiLedgerParts.readReceiptsPart(1)).resolves.toEqual([])
  })

  it('reports a body that is not a list of receipts as unavailable', async () => {
    serve(json({ error: 'no' }), json([{ id: 'x' }]))
    await expect(apiLedgerParts.readReceiptsPart(1)).rejects.toBeInstanceOf(PartsUnavailableError)
    await expect(apiLedgerParts.readReceiptsPart(1)).rejects.toBeInstanceOf(PartsUnavailableError)
  })

  it('is served through apiDataSource', async () => {
    serve(json([receipt]))
    await expect(apiDataSource.readReceiptsPart!(12)).resolves.toEqual([receipt])
  })
})

describe('apiLedgerParts, transactions', () => {
  const page = { items: [makeTransaction({ id: 7 })], nextCursor: 'next' }
  const summary = { revision: 'abc', count: 3, capped: false, netSpendCents: 1200 }

  it('reads a page with the filter, the page size and the cursor in the query, and never from a cache', async () => {
    const fetchMock = serve(json(page))
    await expect(
      apiLedgerParts.readTransactionPage({ month: '2026-03', query: 'rent' }, { limit: 100, cursor: 'c1' }),
    ).resolves.toEqual(page)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/expenses/transactions/list?month=2026-03&query=rent&limit=100&cursor=c1')
    expect(init).toMatchObject({ cache: 'no-store', credentials: 'same-origin' })
  })

  it('reads the summary of a filter, with no page parameters', async () => {
    const fetchMock = serve(json(summary))
    await expect(apiLedgerParts.readTransactionSummary({ categoryId: 4 })).resolves.toEqual(summary)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/expenses/transactions/summary?categoryId=4')
  })

  it('hands the abort signal to fetch, so a read that is no longer wanted is cancelled', async () => {
    const fetchMock = serve(json(page), json(summary))
    const controller = new AbortController()
    await apiLedgerParts.readTransactionPage({}, { signal: controller.signal })
    await apiLedgerParts.readTransactionSummary({}, { signal: controller.signal })
    for (const call of fetchMock.mock.calls) expect((call[1] as RequestInit).signal).toBe(controller.signal)
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('signal')
  })

  it('takes a last page, which has no cursor', async () => {
    serve(json({ items: [], nextCursor: null }))
    await expect(apiLedgerParts.readTransactionPage({})).resolves.toEqual({ items: [], nextCursor: null })
  })

  it('reports a body of another shape as unavailable', async () => {
    serve(json({ items: [{ id: 'x' }], nextCursor: null }), json({ count: 1 }))
    await expect(apiLedgerParts.readTransactionPage({})).rejects.toBeInstanceOf(PartsUnavailableError)
    await expect(apiLedgerParts.readTransactionSummary({})).rejects.toBeInstanceOf(PartsUnavailableError)
  })

  it('reads the server refusing a cursor or a filter as a validation error with its own words, as the demo source does', async () => {
    serve(json({ error: 'Invalid cursor' }, { status: 400 }), json({ error: 'month must be YYYY-MM' }, { status: 400 }))
    await expect(apiLedgerParts.readTransactionPage({}, { cursor: 'x' })).rejects.toThrow(ValidationError)
    await expect(apiLedgerParts.readTransactionSummary({ month: 'soon' })).rejects.toThrow('month must be YYYY-MM')
  })

  it('still reads a refused range of months as too large', async () => {
    serve(json({ error: 'The range holds more than 5000 rows' }, { status: 400 }))
    await expect(apiLedgerParts.readMonthsPart({ from: '2025-01', to: '2025-03' })).rejects.toBeInstanceOf(PartTooLargeError)
  })

  it('is served through apiDataSource', async () => {
    serve(json(page), json(summary))
    await expect(apiDataSource.readTransactionPage!({})).resolves.toEqual(page)
    await expect(apiDataSource.readTransactionSummary!({})).resolves.toEqual(summary)
  })
})

describe('apiDataSource, ledger parts', () => {
  it('serves the three parts through the same client, loaded when first used', async () => {
    const fetchMock = serve(json(reference), json(rows), json(cube))
    await expect(apiDataSource.readReferencePart!()).resolves.toEqual(reference)
    await expect(apiDataSource.readMonthsPart!({ from: '2025-01', to: '2025-03' })).resolves.toEqual(rows)
    await expect(apiDataSource.readCubePart!({ from: '2025-01', to: '2025-03' })).resolves.toEqual(cube)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('apiLedgerParts, series', () => {
  const series = {
    label: 'Gym',
    accountId: 1,
    categoryId: 2,
    type: 'expense',
    amountCents: 2500,
    newestDates: ['2026-01-05', '2026-02-05', '2026-03-05'],
    olderGaps: [],
    budgetMonths: ['2026-01', '2026-02', '2026-03'],
    budgetOffsets: [0, 0, 0],
  }

  it('reads the series of the whole history from /series, from the browser cache like the other parts', async () => {
    const fetchMock = serve(json({ revision: 'abc', series: [series] }))
    await expect(apiLedgerParts.readSeriesPart()).resolves.toEqual({ revision: 'abc', series: [series] })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/expenses/series')
    expect(init.cache).toBeUndefined()
  })

  it('reads it again past every cache when a 304 reaches it with no body to use', async () => {
    const fetchMock = serve(new Response(null, { status: 304 }), json({ revision: 'abc', series: [] }))
    await expect(apiLedgerParts.readSeriesPart()).resolves.toEqual({ revision: 'abc', series: [] })
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ cache: 'reload' })
  })

  it.each([
    ['no revision', { series: [] }],
    ['a series that is not a list', { revision: 'abc', series: {} }],
    ['a series with no dates', { revision: 'abc', series: [{ ...series, newestDates: [] }] }],
    ['a series with no label', { revision: 'abc', series: [{ ...series, label: undefined }] }],
    ['a series with no gaps list', { revision: 'abc', series: [{ ...series, olderGaps: 4 }] }],
    ['dates that are numbers', { revision: 'abc', series: [{ ...series, newestDates: [20260105] }] }],
    ['gaps that are text', { revision: 'abc', series: [{ ...series, olderGaps: ['3'] }] }],
    ['budget offsets that are text', { revision: 'abc', series: [{ ...series, budgetOffsets: ['0'] }] }],
    ['budget months that are numbers', { revision: 'abc', series: [{ ...series, budgetMonths: [202601] }] }],
  ])('reports %s as unavailable', async (_name, body) => {
    serve(json(body))
    await expect(apiLedgerParts.readSeriesPart()).rejects.toBeInstanceOf(PartsUnavailableError)
  })

  it('is served through apiDataSource', async () => {
    serve(json({ revision: 'abc', series: [] }))
    await expect(apiDataSource.readSeriesPart!()).resolves.toEqual({ revision: 'abc', series: [] })
  })

  describe('while the server is still preparing the descriptions it groups on', () => {
    const preparing = () => json({ error: 'Descriptions are being prepared' }, { status: 503 })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('asks again a second later, and gets the series once it can give them', async () => {
      vi.useFakeTimers()
      const fetchMock = serve(preparing(), preparing(), json({ revision: 'abc', series: [] }))
      const read = apiLedgerParts.readSeriesPart()
      await vi.advanceTimersByTimeAsync(2500)
      await expect(read).resolves.toEqual({ revision: 'abc', series: [] })
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('gives the 503 to the caller after a few tries, and does not ask again for any other failure', async () => {
      vi.useFakeTimers()
      const fetchMock = serve(preparing(), preparing(), preparing(), preparing(), preparing())
      const gave = apiLedgerParts.readSeriesPart().catch((error: unknown) => error)
      await vi.advanceTimersByTimeAsync(10_000)
      expect(await gave).toEqual(new ApiError('Descriptions are being prepared', 503))
      expect(fetchMock).toHaveBeenCalledTimes(4)
      serve(json({ error: 'Boom' }, { status: 500 }))
      await expect(apiLedgerParts.readSeriesPart()).rejects.toEqual(new ApiError('Boom', 500))
    })
  })
})
