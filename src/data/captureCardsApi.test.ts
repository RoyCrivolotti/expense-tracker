import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCardLinks, linkCard, unlinkCard } from './captureCardsApi'

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
afterEach(() => vi.unstubAllGlobals())

function stub(body: unknown) {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok(body)))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('card link calls', () => {
  it('reads the links and the waiting cards', async () => {
    const fetchMock = stub({ cards: [], waiting: [] })

    expect(await fetchCardLinks()).toEqual({ cards: [], waiting: [] })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/capture-cards')
  })

  it('links with the digits in the body, never in the address', async () => {
    const fetchMock = stub({ ok: true })

    await linkCard('iberia', '4821', 3)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/capture-cards')
    expect(init).toMatchObject({ method: 'POST', body: '{"source":"iberia","digits":"4821","accountId":3}' })
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
  })

  it('removes with the link named in the body', async () => {
    const fetchMock = stub({ ok: true })

    await unlinkCard({ source: 'santander', digitsKind: 'card', digits: '4821' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/capture-cards')
    expect(init).toMatchObject({ method: 'DELETE', body: '{"source":"santander","digitsKind":"card","digits":"4821"}' })
  })
})
