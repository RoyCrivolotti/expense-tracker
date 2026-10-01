import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiDataSource } from './apiDataSource'

function mockFetchOnce(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(body),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiDataSource — labels', () => {
  it('creates a label with a POST to /labels', async () => {
    const fetchMock = mockFetchOnce({ id: 1, name: 'Japan trip' })

    await apiDataSource.createLabel!({
      name: 'Japan trip',
      color: '#10b981',
      sortOrder: 0,
      active: true,
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/expenses/labels')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Japan trip',
      color: '#10b981',
      sortOrder: 0,
      active: true,
    })
  })

  it('updates a label with a PATCH to /labels/:id', async () => {
    const fetchMock = mockFetchOnce({ id: 1, name: 'Osaka trip' })

    await apiDataSource.updateLabel!(1, { name: 'Osaka trip' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/expenses/labels/1')
    expect(init.method).toBe('PATCH')
  })

  it('deletes a label with a DELETE to /labels/:id', async () => {
    const fetchMock = mockFetchOnce({ unlabeled: 2 })

    const result = await apiDataSource.deleteLabel!(1)

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/expenses/labels/1')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' })
    expect(result).toEqual({ unlabeled: 2 })
  })

  it('replaces a transaction’s labels with a PUT to /transactions/:id/labels', async () => {
    const fetchMock = mockFetchOnce({ id: 7, labelIds: [1, 2] })

    await apiDataSource.setTransactionLabels!(7, [1, 2])

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/expenses/transactions/7/labels')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ labelIds: [1, 2] })
  })
})
