import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  announceRecommendationsChanged,
  dismissRecommendation,
  fetchRecommendations,
  linkRecommendation,
  onRecommendationsChanged,
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

  it('dismisses with no body', async () => {
    const fetchMock = stub({ ok: true })

    await dismissRecommendation(ID)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/recommendations/${ID}/dismiss`)
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
  })

  it('links to the row the person typed', async () => {
    const fetchMock = stub({ ok: true })

    await linkRecommendation(ID, 12)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/recommendations/${ID}/link`)
    expect(init.body).toBe('{"transactionId":12}')
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
