import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiDataSource } from './apiDataSource'

function mockFetchOnce(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve(body),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiDataSource — deleting a wealth account', () => {
  it('sends a DELETE to /wealth-accounts/:id and returns whether the server archived it', async () => {
    const fetchMock = mockFetchOnce({ ok: true, archived: false })

    const result = await apiDataSource.deleteWealthAccount!(7)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/expenses/wealth-accounts/7')
    expect(init.method).toBe('DELETE')
    expect(result).toEqual({ archived: false })
  })

  it('reports an archived account as archived', async () => {
    mockFetchOnce({ ok: true, archived: true })

    await expect(apiDataSource.deleteWealthAccount!(7)).resolves.toEqual({ archived: true })
  })

  it('treats an answer that does not say as archived, as a server from before it did', async () => {
    mockFetchOnce({ ok: true })

    await expect(apiDataSource.deleteWealthAccount!(7)).resolves.toEqual({ archived: true })
  })
})
