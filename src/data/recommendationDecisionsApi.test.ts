import { afterEach, describe, expect, it, vi } from 'vitest'
import { dismissRecommendation, linkRecommendation } from './recommendationDecisionsApi'

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
const ID = '0b0c0d0e-1111-4222-8333-444455556666'

afterEach(() => vi.unstubAllGlobals())

function stub(body: unknown) {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok(body)))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('recommendation decisions', () => {
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
