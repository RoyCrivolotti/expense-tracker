import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  announceRecommendationsChanged,
  fetchRecommendations,
  onRecommendationsChanged,
  PossibleDuplicateError,
  submitRecommendation,
} from './recommendationsApi'

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
const ID = '0b0c0d0e-1111-4222-8333-444455556666'

afterEach(() => vi.unstubAllGlobals())

function stub(body: unknown) {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok(body)))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('recommendation calls', () => {
  it('reads the first page with the limit, and a later one with its cursor', async () => {
    const fetchMock = stub({ recommendations: [], next: null, openCount: 0 })

    await fetchRecommendations()
    await fetchRecommendations('2026-11-10~abc')

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/recommendations?limit=50')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/recommendations?limit=50&after=2026-11-10%7Eabc')
  })

  it('submits the edited transaction as JSON to the recommendation', async () => {
    const fetchMock = stub({ id: 7 })
    const input = {
      date: '2026-11-10',
      budgetMonth: '2026-11',
      description: 'Coffee',
      accountId: 1,
      categoryId: 2,
      type: 'expense' as const,
      amountCents: 350,
      cancelled: false,
    }

    expect(await submitRecommendation(ID, input)).toEqual({ id: 7 })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/recommendations/${ID}/submit`)
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify(input) })
  })
})

describe('submitting when a typed row looks the same', () => {
  const input = {
    date: '2026-11-10',
    budgetMonth: '2026-11',
    description: 'Coffee',
    accountId: 1,
    categoryId: 2,
    type: 'expense' as const,
    amountCents: 350,
    cancelled: false,
  }
  const refuse = (body: unknown) =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 409, headers: { 'content-type': 'application/json' } })))

  it('sends allowDuplicate: true only when asked to, and not otherwise', async () => {
    const fetchMock = stub({ id: 7 })

    await submitRecommendation(ID, input, true)
    await submitRecommendation(ID, input)

    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toEqual({ ...input, allowDuplicate: true })
    expect(JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)).toEqual(input)
  })

  it('rejects with the row the server named', async () => {
    const match = { transactionId: 41, description: 'Cafe at the till', date: '2026-11-09' }
    refuse({ error: 'A typed row already looks like this payment', code: 'possible-duplicate', possibleMatch: match })

    const error: unknown = await submitRecommendation(ID, input).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(PossibleDuplicateError)
    expect((error as PossibleDuplicateError).possibleMatch).toEqual(match)
  })

  it('leaves any other 409 as the plain error it is', async () => {
    refuse({ error: 'This recommendation was already decided' })

    const error: unknown = await submitRecommendation(ID, input).catch((e: unknown) => e)

    expect(error).not.toBeInstanceOf(PossibleDuplicateError)
    expect(error).toMatchObject({ status: 409, message: 'This recommendation was already decided' })
  })

  it('does not take a malformed duplicate answer for one', async () => {
    refuse({ code: 'possible-duplicate', possibleMatch: { description: 'No id' } })

    expect(await submitRecommendation(ID, input).catch((e: unknown) => e)).not.toBeInstanceOf(PossibleDuplicateError)
  })
})

describe('change announcements', () => {
  it('reach a listener until it is removed', () => {
    const listener = vi.fn()
    const off = onRecommendationsChanged(listener)

    announceRecommendationsChanged()
    off()
    announceRecommendationsChanged()

    expect(listener).toHaveBeenCalledOnce()
  })
})
